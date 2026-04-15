// Bible verses about prayer. Deliberately kept short enough to fit on a
// banner card at a readable size.
export const PRAYER_VERSES = [
  {
    text: 'Do not be anxious about anything, but in every situation, by prayer and petition, present your requests to God.',
    reference: 'Philippians 4:6'
  },
  {
    text: 'Ask and it will be given to you; seek and you will find; knock and the door will be opened to you.',
    reference: 'Matthew 7:7'
  },
  {
    text: 'The prayer of a righteous person is powerful and effective.',
    reference: 'James 5:16'
  },
  {
    text: 'Rejoice always, pray continually, give thanks in all circumstances.',
    reference: '1 Thessalonians 5:16-18'
  },
  {
    text: 'Whatever you ask for in prayer, believe that you have received it, and it will be yours.',
    reference: 'Mark 11:24'
  },
  {
    text: 'Be joyful in hope, patient in affliction, faithful in prayer.',
    reference: 'Romans 12:12'
  },
  {
    text: 'Devote yourselves to prayer, being watchful and thankful.',
    reference: 'Colossians 4:2'
  },
  {
    text: 'Cast all your anxiety on him because he cares for you.',
    reference: '1 Peter 5:7'
  },
  {
    text: 'The Lord is near to all who call on him, to all who call on him in truth.',
    reference: 'Psalm 145:18'
  },
  {
    text: 'Call to me and I will answer you and tell you great and unsearchable things you do not know.',
    reference: 'Jeremiah 33:3'
  },
  {
    text: 'Let us then approach God\u2019s throne of grace with confidence, so that we may receive mercy.',
    reference: 'Hebrews 4:16'
  },
  {
    text: 'The Spirit helps us in our weakness. We do not know what we ought to pray for, but the Spirit himself intercedes for us.',
    reference: 'Romans 8:26'
  },
  {
    text: 'If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault.',
    reference: 'James 1:5'
  },
  {
    text: 'This is the confidence we have in approaching God: that if we ask anything according to his will, he hears us.',
    reference: '1 John 5:14'
  },
  {
    text: 'The righteous cry out, and the Lord hears them; he delivers them from all their troubles.',
    reference: 'Psalm 34:17'
  },
  {
    text: 'Pray in the Spirit on all occasions with all kinds of prayers and requests.',
    reference: 'Ephesians 6:18'
  },
  {
    text: 'When you pray, go into your room, close the door and pray to your Father, who is unseen.',
    reference: 'Matthew 6:6'
  },
  {
    text: 'If you remain in me and my words remain in you, ask whatever you wish, and it will be done for you.',
    reference: 'John 15:7'
  },
  {
    text: 'Before they call I will answer; while they are still speaking I will hear.',
    reference: 'Isaiah 65:24'
  },
  {
    text: 'In the morning, Lord, you hear my voice; in the morning I lay my requests before you and wait expectantly.',
    reference: 'Psalm 5:3'
  },
  {
    text: 'Evening, morning and noon I cry out in distress, and he hears my voice.',
    reference: 'Psalm 55:17'
  },
  {
    text: 'Is anyone among you in trouble? Let them pray. Is anyone happy? Let them sing songs of praise.',
    reference: 'James 5:13'
  },
  {
    text: 'Then you will call on me and come and pray to me, and I will listen to you.',
    reference: 'Jeremiah 29:12'
  },
  {
    text: 'Praise be to God, who has not rejected my prayer or withheld his love from me.',
    reference: 'Psalm 66:20'
  },
  {
    text: 'I call on you, my God, for you will answer me; turn your ear to me and hear my prayer.',
    reference: 'Psalm 17:6'
  },
  {
    text: 'Again, truly I tell you that if two of you on earth agree about anything they ask for, it will be done for them.',
    reference: 'Matthew 18:19'
  },
  {
    text: 'If my people, who are called by my name, will humble themselves and pray, then I will hear from heaven.',
    reference: '2 Chronicles 7:14'
  },
  {
    text: 'Answer me when I call to you, my righteous God. Give me relief from my distress; have mercy on me and hear my prayer.',
    reference: 'Psalm 4:1'
  },
  {
    text: 'Be still, and know that I am God.',
    reference: 'Psalm 46:10'
  },
  {
    text: 'He will respond to the prayer of the destitute; he will not despise their plea.',
    reference: 'Psalm 102:17'
  },
  {
    text: 'Trust in the Lord with all your heart and lean not on your own understanding.',
    reference: 'Proverbs 3:5'
  },
  {
    text: 'Draw near to God, and he will draw near to you.',
    reference: 'James 4:8'
  },
  {
    text: 'The Lord has heard my cry for mercy; the Lord accepts my prayer.',
    reference: 'Psalm 6:9'
  },
  {
    text: 'May my prayer be set before you like incense; may the lifting up of my hands be like the evening sacrifice.',
    reference: 'Psalm 141:2'
  },
  {
    text: 'Let the morning bring me word of your unfailing love, for I have put my trust in you.',
    reference: 'Psalm 143:8'
  },
  {
    text: 'Come to me, all you who are weary and burdened, and I will give you rest.',
    reference: 'Matthew 11:28'
  },
  {
    text: 'Our Father in heaven, hallowed be your name, your kingdom come, your will be done.',
    reference: 'Matthew 6:9-10'
  },
  {
    text: 'Seek the Lord while he may be found; call on him while he is near.',
    reference: 'Isaiah 55:6'
  },
  {
    text: 'The Lord is my shepherd, I lack nothing.',
    reference: 'Psalm 23:1'
  },
  {
    text: 'He heals the brokenhearted and binds up their wounds.',
    reference: 'Psalm 147:3'
  },
  {
    text: 'For where two or three gather in my name, there am I with them.',
    reference: 'Matthew 18:20'
  },
  {
    text: 'If you believe, you will receive whatever you ask for in prayer.',
    reference: 'Matthew 21:22'
  }
];

// Environment / nature photos from Unsplash's CDN. Images are fetched as
// CSS background-image (no CORS needed) and a gradient overlay ensures the
// verse text stays legible even if any particular image fails to load.
// All URLs use Unsplash's documented auto-format/size query params.
const u = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&h=440&q=80`;

export const NATURE_IMAGES = [
  u('1506905925346-21bda4d32df4'), // mountain vista
  u('1470071459604-3b5ec3a7fe05'), // misty peaks
  u('1441974231531-c6227db76b6e'), // forest road
  u('1501785888041-af3ef285b470'), // mountain lake
  u('1472214103451-9374bd1c798e'), // tropical isle
  u('1518495973542-4542c06a5843'), // sunlit forest
  u('1447752875215-b2761acb3c5d'), // pine forest
  u('1519331379826-f10be5486c6f'), // misty mountain
  u('1506765515384-028b60a970df'), // ocean waves
  u('1493246507139-91e8fad9978e'), // mountain peak
  u('1439853949127-fa647821eba0'), // beach at dusk
  u('1433086966358-54859d0ed716'), // waterfall
  u('1465056836041-7f43ac27dcb5'), // alpine lake
  u('1488866022504-f2584929ca5f'), // starry sky
  u('1476820865390-c52aeebb9891'), // still lake
  u('1470813740244-df37b8c1edcb'), // stars over mountains
  u('1518002171953-a080ee817e1f'), // redwood forest
  u('1475924156734-496f6cac6ec1'), // mountain ridge
  u('1475113548554-5a36f1f523d6'), // rocky coast
  u('1497436072909-60f360e1d4b1'), // alpine valley
  u('1469474968028-56623f02e42e'), // crashing wave
  u('1533105079780-92b9be482077'), // mountain reflection
  u('1417325384643-aac51acc9e5d'), // forest meadow
  u('1464822759023-fed622ff2c3b'), // calm lake
  u('1506748686214-e9df14d4d9d0'), // tropical shore
  u('1426604966848-d7adac402bff'), // forest light
  u('1501436513145-30f24e19fcc8'), // beach sunset
  u('1462392246754-28dfa2df8e6b'), // forest path
  u('1500534314209-a25ddb2bd429'), // beach sunset
  u('1510784722466-f2aa9c52fff6'), // snowy mountain
  u('1495567720989-cebdbdd97913'), // iceland waterfall
  u('1454942901704-3c44c11b2ad1'), // sandy beach
  u('1455849318743-b2233052fcff'), // sunset beach
  u('1490730141103-6cac27aaab94'), // meadow sunrise
  u('1507525428034-b723cf961d3e'), // tropical beach
  u('1507041957456-9c397ce39c97'), // mountain valley
  u('1520962922320-2038eebab146'), // canyon
  u('1444080748397-f442aa95c3e5'), // clear lake
  u('1504198266287-1659872e6590'), // sunrise
  u('1490682143684-14369e18dce8')  // autumn
];
