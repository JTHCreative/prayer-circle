// Bible verses about prayer (ESV). Organized into four themes.
// The rotation simply iterates through the array one per day.
export const PRAYER_VERSES = [
  // --- Instructions and Guidance on How to Pray ---
  {
    text: 'But when you pray, go into your room and shut the door and pray to your Father who is in secret. And your Father who sees in secret will reward you.',
    reference: 'Matthew 6:6'
  },
  {
    text: 'And when you pray, do not heap up empty phrases as the Gentiles do, for they think that they will be heard for their many words.',
    reference: 'Matthew 6:7'
  },
  {
    text: 'Our Father in heaven, hallowed be your name. Your kingdom come, your will be done, on earth as it is in heaven.',
    reference: 'Matthew 6:9\u201313'
  },
  {
    text: 'Rejoice always, pray without ceasing, give thanks in all circumstances; for this is the will of God in Christ Jesus for you.',
    reference: '1 Thessalonians 5:16\u201318'
  },
  {
    text: 'Continue steadfastly in prayer, being watchful in it with thanksgiving.',
    reference: 'Colossians 4:2'
  },
  {
    text: 'Rejoice in hope, be patient in tribulation, be constant in prayer.',
    reference: 'Romans 12:12'
  },
  {
    text: 'But I say to you who hear, Love your enemies, do good to those who hate you, bless those who curse you, pray for those who abuse you.',
    reference: 'Luke 6:27\u201328'
  },
  {
    text: 'I desire then that in every place the men should pray, lifting holy hands without anger or quarreling.',
    reference: '1 Timothy 2:8'
  },

  // --- Promises and God\u2019s Response ---
  {
    text: 'Then you will call upon me and come and pray to me, and I will hear you.',
    reference: 'Jeremiah 29:12'
  },
  {
    text: 'Call to me and I will answer you, and will tell you great and hidden things that you have not known.',
    reference: 'Jeremiah 33:3'
  },
  {
    text: 'Ask, and it will be given to you; seek, and you will find; knock, and it will be opened to you.',
    reference: 'Matthew 7:7'
  },
  {
    text: 'And this is the confidence that we have toward him, that if we ask anything according to his will he hears us.',
    reference: '1 John 5:14'
  },
  {
    text: 'The Lord is near to all who call on him, to all who call on him in truth.',
    reference: 'Psalm 145:18'
  },
  {
    text: 'The Lord is far from the wicked, but he hears the prayer of the righteous.',
    reference: 'Proverbs 15:29'
  },
  {
    text: 'When the righteous cry for help, the Lord hears and delivers them out of all their troubles.',
    reference: 'Psalm 34:17'
  },
  {
    text: 'If my people who are called by my name humble themselves, and pray and seek my face and turn from their wicked ways, then I will hear from heaven and will forgive their sin and heal their land.',
    reference: '2 Chronicles 7:14'
  },

  // --- Faith and Persistence ---
  {
    text: 'Therefore I tell you, whatever you ask in prayer, believe that you have received it, and it will be yours.',
    reference: 'Mark 11:24'
  },
  {
    text: 'And whatever you ask in prayer, you will receive, if you have faith.',
    reference: 'Matthew 21:22'
  },
  {
    text: 'Therefore, confess your sins to one another and pray for one another, that you may be healed. The prayer of a righteous person has great power as it is working.',
    reference: 'James 5:16'
  },
  {
    text: 'And he told them a parable to the effect that they ought always to pray and not lose heart.',
    reference: 'Luke 18:1'
  },
  {
    text: 'If you abide in me, and my words abide in you, ask whatever you wish, and it will be done for you.',
    reference: 'John 15:7'
  },
  {
    text: 'If any of you lacks wisdom, let him ask God, who gives generously to all without reproach, and it will be given him.',
    reference: 'James 1:5'
  },

  // --- Peace, Strength, and the Holy Spirit ---
  {
    text: 'Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God. And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.',
    reference: 'Philippians 4:6\u20137'
  },
  {
    text: 'Likewise the Spirit helps us in our weakness. For we do not know what to pray for as we ought, but the Spirit himself intercedes for us with groanings too deep for words.',
    reference: 'Romans 8:26'
  },
  {
    text: 'Let us then with confidence draw near to the throne of grace, that we may receive mercy and find grace to help in time of need.',
    reference: 'Hebrews 4:16'
  },
  {
    text: 'Watch and pray that you may not enter into temptation. The spirit indeed is willing, but the flesh is weak.',
    reference: 'Matthew 26:41'
  },
  {
    text: 'O Lord, in the morning you hear my voice; in the morning I prepare a sacrifice for you and watch.',
    reference: 'Psalm 5:3'
  },
  {
    text: 'I call upon you, for you will answer me, O God; incline your ear to me; hear my words.',
    reference: 'Psalm 17:6'
  },
  {
    text: 'Seek the Lord and his strength; seek his presence continually!',
    reference: '1 Chronicles 16:11'
  },
  {
    text: 'For the eyes of the Lord are on the righteous, and his ears are open to their prayer.',
    reference: '1 Peter 3:12'
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
