import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LOCATION_POINTS } from '../data/locations.js';
import RegionPrayerPanel from './RegionPrayerPanel.jsx';

// Earth diffuse texture — hosted on jsdelivr (CORS-friendly) from the official
// three.js repo. If you'd like to self-host, drop a 2048x1024 equirectangular
// earth texture into /public and change the URL below.
const EARTH_TEXTURE_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg';

const EARTH_RADIUS = 1;
const MARKER_SURFACE_RADIUS = 1.008; // sit just above the surface
const MARKER_SIZE = 0.013;
const MARKER_COLOR = 0x2563eb; // matches --primary theme blue

// Convert geographic lat/lng (degrees) to a 3D point on a sphere of the given
// radius, oriented to match three.js' default SphereGeometry UVs + the
// standard equirectangular earth texture.
function latLngToVec3(lat, lng, radius) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// A draggable, slowly auto-rotating 3D Earth built directly on three.js.
// The canvas fills its container; the container should set a size + background.
export default function Globe() {
  const mountRef = useRef(null);
  const tooltipRef = useRef(null);
  const tooltipCardRef = useRef(null);
  const [hoveredName, setHoveredName] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- Scene, camera, renderer ---------------------------------------------
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      42,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      100
    );
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true // lets the gradient background show through
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // --- Lights --------------------------------------------------------------
    // Moderate ambient + strong key + strong fill/rim gives shaded form
    // without flattening contrast. Fill picks up a cool blue tint, rim picks
    // up a warm violet tint, so light and shadow sides read distinctly.
    const ambient = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff3e0, 3.0);
    keyLight.position.set(5, 3, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb8d4ff, 2.0);
    fillLight.position.set(-5, -1, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xc9b3ff, 1.8);
    rimLight.position.set(-2, 4, -5);
    scene.add(rimLight);

    // --- Earth mesh ----------------------------------------------------------
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      color: 0xb8c6da, // fallback while the texture loads
      shininess: 8,
      specular: 0x222b3a,
      // Faint self-illumination so the shadow side keeps some texture detail
      // without washing out the contrast from the directional lights.
      emissive: 0x0e1a35,
      emissiveIntensity: 0.35
    });
    const earth = new THREE.Mesh(geometry, material);
    // Tilt so North is up-ish and it feels less static.
    earth.rotation.z = (23.4 * Math.PI) / 180;
    scene.add(earth);

    // --- Atmosphere halo -----------------------------------------------------
    // A slightly larger back-facing sphere with a Fresnel-weighted additive
    // shader gives the Earth a soft cyan glow around its silhouette, which
    // both separates it from the page background and sells the planet.
    const atmosphereGeometry = new THREE.SphereGeometry(1.18, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      uniforms: {
        glowColor: { value: new THREE.Color(0x5aa9ff) },
        power: { value: 2.8 },
        intensity: { value: 1.35 }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 glowColor;
        uniform float power;
        uniform float intensity;
        void main() {
          float rim = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), power);
          gl_FragColor = vec4(glowColor, 1.0) * rim * intensity;
        }
      `
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        material.map = texture;
        material.emissiveMap = texture;    // use same texture for emissive tint
        material.emissive.set(0xffffff);   // white emissive lets texture colors show fully
        material.emissiveIntensity = 0.28; // keep continents visible on the shadow side without flattening contrast
        material.color.set(0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      (err) => {
        // Texture failed (offline, CORS, etc) — keep the fallback blue sphere.
        // eslint-disable-next-line no-console
        console.warn('Earth texture failed to load', err);
      }
    );

    // --- Location markers ----------------------------------------------------
    // Small blue spheres placed on the earth's surface for each selectable
    // location. Parented to the earth so they inherit the axial tilt and any
    // future earth-level rotation.
    const markersGroup = new THREE.Group();
    earth.add(markersGroup);

    const markerGeometry = new THREE.SphereGeometry(MARKER_SIZE, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: MARKER_COLOR });
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: MARKER_COLOR,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const haloGeometry = new THREE.RingGeometry(
      MARKER_SIZE * 1.6,
      MARKER_SIZE * 2.6,
      24
    );

    const markers = LOCATION_POINTS.map((loc) => {
      const surfacePos = latLngToVec3(loc.lat, loc.lng, MARKER_SURFACE_RADIUS);
      const mesh = new THREE.Mesh(markerGeometry, markerMaterial);
      mesh.position.copy(surfacePos);
      mesh.userData = { name: loc.name };
      markersGroup.add(mesh);

      // Flat halo ring tangent to the surface, slightly above so it doesn't
      // z-fight with the earth.
      const halo = new THREE.Mesh(haloGeometry, haloMaterial);
      halo.position.copy(surfacePos).multiplyScalar(1.002);
      halo.lookAt(surfacePos.clone().multiplyScalar(2));
      markersGroup.add(halo);

      return mesh;
    });

    // --- Controls ------------------------------------------------------------
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 1.4; // can't zoom closer than just above the surface
    controls.maxDistance = 6;   // far enough to see the whole globe with margin
    controls.enablePan = false;
    controls.rotateSpeed = 0.45;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    // Pause auto-rotate while the user is dragging for a more natural feel.
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });
    controls.addEventListener('end', () => {
      controls.autoRotate = true;
    });

    // --- Hover detection -----------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered = null;

    const updatePointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const setHovered = (next) => {
      if (next === hovered) return;
      if (hovered) hovered.scale.setScalar(1);
      hovered = next;
      if (hovered) hovered.scale.setScalar(1.8);
      setHoveredName(hovered ? hovered.userData.name : null);
      renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    };

    const handlePointerMove = (event) => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      // Include the earth so a marker on the far side (occluded by the planet)
      // doesn't trigger — the earth intersection will come first.
      const hits = raycaster.intersectObjects([earth, ...markers], false);
      if (hits.length && hits[0].object !== earth) {
        setHovered(hits[0].object);
      } else {
        setHovered(null);
      }
    };

    const handlePointerLeave = () => setHovered(null);

    // Distinguish a click from a drag: remember the pointerdown position, and
    // only treat pointerup as a click if the pointer barely moved. This keeps
    // OrbitControls' drag-to-rotate from accidentally triggering a region
    // selection.
    let downX = 0;
    let downY = 0;
    let downOnCanvas = false;
    const CLICK_SLOP = 5;
    const handlePointerDown = (event) => {
      downX = event.clientX;
      downY = event.clientY;
      downOnCanvas = true;
    };
    const handlePointerUp = (event) => {
      if (!downOnCanvas) return;
      downOnCanvas = false;
      const dx = event.clientX - downX;
      const dy = event.clientY - downY;
      if (dx * dx + dy * dy > CLICK_SLOP * CLICK_SLOP) return;
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([earth, ...markers], false);
      if (hits.length && hits[0].object !== earth) {
        const name = hits[0].object.userData?.name;
        if (name) setSelectedRegion(name);
      }
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // --- Animation loop ------------------------------------------------------
    const tmpVec = new THREE.Vector3();
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      // Keep the tooltip pinned to the hovered marker as the globe spins or
      // the user drags. Writing transform directly on a ref (not through React
      // state) avoids a re-render every frame.
      if (hovered && tooltipRef.current) {
        hovered.getWorldPosition(tmpVec);
        tmpVec.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (tmpVec.x * 0.5 + 0.5) * rect.width;
        const y = (-tmpVec.y * 0.5 + 0.5) * rect.height;
        tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    };
    animate();

    // --- Resize handling -----------------------------------------------------
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    // --- Cleanup -------------------------------------------------------------
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      geometry.dispose();
      if (material.map) material.map.dispose();
      material.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={mountRef} className="globe-canvas" aria-label="3D globe of Earth">
      <div
        ref={tooltipRef}
        className="globe-marker-tooltip"
        role="tooltip"
        aria-hidden={!hoveredName}
      >
        <div
          ref={tooltipCardRef}
          className={`globe-marker-tooltip__card${hoveredName ? ' visible' : ''}`}
        >
          {hoveredName}
        </div>
      </div>
      {selectedRegion && (
        <RegionPrayerPanel
          region={selectedRegion}
          onClose={() => setSelectedRegion(null)}
        />
      )}
    </div>
  );
}
