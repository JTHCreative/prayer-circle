import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Earth diffuse texture — hosted on jsdelivr (CORS-friendly) from the official
// three.js repo. If you'd like to self-host, drop a 2048x1024 equirectangular
// earth texture into /public and change the URL below.
const EARTH_TEXTURE_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg';

// A draggable, slowly auto-rotating 3D Earth built directly on three.js.
// The canvas fills its container; the container should set a size + background.
export default function Globe() {
  const mountRef = useRef(null);

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
    // Very bright ambient so the whole globe reads clearly from every angle,
    // plus a key light for form, a strong fill light on the opposite side so
    // the "night" side stays lit, and a rim light to catch the edge.
    const ambient = new THREE.AmbientLight(0xffffff, 2.2);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(5, 3, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd6e4ff, 1.4);
    fillLight.position.set(-5, -1, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe4d6ff, 0.8);
    rimLight.position.set(-2, 4, -5);
    scene.add(rimLight);

    // --- Earth mesh ----------------------------------------------------------
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      color: 0xb8c6da, // fallback while the texture loads
      shininess: 4,
      // Bright self-illumination so the texture colors read clearly even on
      // the shadowed side.
      emissive: 0x1a2f5c,
      emissiveIntensity: 0.6
    });
    const earth = new THREE.Mesh(geometry, material);
    // Tilt so North is up-ish and it feels less static.
    earth.rotation.z = (23.4 * Math.PI) / 180;
    scene.add(earth);

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
        material.emissiveIntensity = 0.5;  // noticeable glow so the dark side stays readable
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

    // --- Animation loop ------------------------------------------------------
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
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
      controls.dispose();
      geometry.dispose();
      if (material.map) material.map.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="globe-canvas" aria-label="3D globe of Earth" />;
}
