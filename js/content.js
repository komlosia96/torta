// All text and photo settings. This is the only file you need to edit.
export const CONTENT = {
  lang: "hu",
  pageTitle: "Boldog szülinapot!",

  // The unicorn says this in its speech bubble before the wish...
  intro: {
    text: "Tudtad, hogy Rutéba nem lehet tortát kiszállítani? :((",
  },
  // ...and the same bubble changes to this once the candles are out.
  happy: {
    text: "Boldog szülinapot, Kicsim!",
  },

  ui: {
    blowButton: "Fújd el a gyertyákat!",
    blowHint: "Kívánj valamit, aztán fújj a telefonra!",
    fallbackHint: "Nem megy a mikrofon? Koppints a gyertyákra!",
    afterHint: "Koppints egy szeletre vagy nyisd ki az albumot!",
    lockedToast: "Előbb fújd el a gyertyákat!",
    close: "Bezár",
    soundOn: "Hang be",
    soundOff: "Hang ki",
    replayTune: "Dallam újra",
    restart: "Újrakezdés",
    soundHint: "Kapcsold be a hangot",
    noWebgl: "Nyisd meg az oldalt Safariban vagy Chrome-ban!",
    // Screen reader labels. {n} is replaced with a number.
    albumAria: "Fotóalbum",
    prevPage: "Előző oldal",
    nextPage: "Következő oldal",
    photoAria: "Kép {n} a 26-ból",
    photoDialog: "Kép nagyítva",
    prevPhoto: "Előző kép",
    nextPhoto: "Következő kép",
    sliceAria: "{n}. szelet",
    candleAria: "{n}. gyertya elfújása",
    unicornAria: "Unikornis",
    cakeAria: "Torta",
  },

  // EXACTLY 1: the message on the slice in the front middle of the cake, the only one that can be opened.
  // Keep it to about 2-6 words so it fits on the slice.
  sliceMessages: [
    "Szeretlek és hiányzol :((",
  ],

  // Shown near the cake after the slice was opened. Empty string means disabled.
  allSlicesText: "",

  // Wax number candles on the cake, one per digit.
  candleNumber: "26",

  // Small sign on a pick stuck in the cream next to the candles. "" shows no sign.
  topper: "Vegan!",

  // Name on the unicorn's blue t-shirt. "" leaves the shirt plain.
  unicornShirt: "Ákos",

  // The leather photo album next to the cake.
  // title: gold lettering on the cover. dedication: optional line on the page facing photo 1, "" shows nothing.
  album: {
    title: "26",
    dedication: "",
  },

  // EXACTLY 26, one per album page, in page order.
  // id N loads assets/photos/full/NN.jpg and assets/photos/thumb/NN.jpg.
  // caption: optional short text under the photo, "" shows nothing.
  photos: [
    { id: 1,  caption: "" },
    { id: 2,  caption: "" },
    { id: 3,  caption: "" },
    { id: 4,  caption: "" },
    { id: 5,  caption: "" },
    { id: 6,  caption: "" },
    { id: 7,  caption: "" },
    { id: 8,  caption: "" },
    { id: 9,  caption: "" },
    { id: 10, caption: "" },
    { id: 11, caption: "" },
    { id: 12, caption: "" },
    { id: 13, caption: "" },
    { id: 14, caption: "" },
    { id: 15, caption: "" },
    { id: 16, caption: "" },
    { id: 17, caption: "" },
    { id: 18, caption: "" },
    { id: 19, caption: "" },
    { id: 20, caption: "" },
    { id: 21, caption: "" },
    { id: 22, caption: "" },
    { id: 23, caption: "" },
    { id: 24, caption: "" },
    { id: 25, caption: "" },
    { id: 26, caption: "" },
  ],
};
