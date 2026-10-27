/**
 * shellRaining brand occupants for the Harness Web client.
 *
 * Occupies three shipped slots that otherwise hold the official fish mark:
 *   - sidebar.brand.mark          (24px box, expanded brand row + collapsed rail)
 *   - sidebar.brand.name          (expanded wordmark beside the mark)
 *   - conversation.hero.brand.mark (34px box, blank-session headline)
 *
 * Presentation is a soft Victor Mono italic wordmark rather than the Neovim
 * dashboard's ASCII pixel art: the banner reads as type at any size, inherits
 * the theme accent, and needs no raster asset. No Harness Client package is
 * imported; the only module dependency is react itself.
 */
window.__ModuleLoader__.load({
	id: "@shellraining/dsh-brand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;

		/** The brand word. */
		const NAME = "shellRaining";

		/**
		 * Brand artwork, self-hosted on the shellraining object store. The sidebar
		 * mark is the owner's avatar; the hero instead shows the italic wordmark.
		 *
		 * The still is used rather than the 3.5MB animated rendition because this
		 * mark renders in the sidebar of every session.
		 */
		const AVATAR_STILL = "https://s3-admin.shellraining.xyz/public/%E5%88%BB%E6%99%B4.png";

		/**
		 * Font stack. Victor Mono first, whose italics are a true cursive set, then
		 * ordinary monospace so the mark still reads as code-adjacent without it.
		 */
		const FONT_STACK =
			'"VictorMono Nerd Font", "Victor Mono", "JetBrainsMono Nerd Font", ' +
			'"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

		/**
		 * "shellRaining" as real glyph outlines, extracted from Victor Mono Medium
		 * Italic (the face FONT_STACK prefers) so the wordmark can be stroke-drawn.
		 *
		 * antfu.me's animated logo works by animating stroke-dasharray along an SVG
		 * stroke, which draws a line progressively. That needs actual path geometry:
		 * stroke-dasharray has no effect on SVG <text>, so the outlines must be real
		 * <path> data. These are the real outlines of the twelve characters, in font
		 * units, one entry per character in NAME order. They are static art derived
		 * from the font, not fetched at runtime, so the mark has no network
		 * dependency and renders identically on every platform.
		 *
		 * `ink` is the tight [x0, y0, x1, y1] bounding box of the whole word in font
		 * units; the viewBox is derived from it so no stroke is ever clipped. The
		 * per-glyph path lengths the animation needs are measured in the browser via
		 * getTotalLength() rather than hardcoded, which keeps this correct even if
		 * the artwork is later replaced.
		 */
		/**
		 * Length of one full write cycle, in ms. The word is drawn, holds on
		 * screen, then the cycle repeats.
		 */
		const CYCLE_MS = 7000;

		/**
		 * Fraction of a cycle spent drawing; the rest is the hold on the settled
		 * word. A long hold keeps the loop from feeling like a progress indicator.
		 */
		const DRAW_SHARE = 0.42;

		/**
		 * Fraction of the cycle at which the pen keyframes finish drawing the
		 * outline, and at which the fill keyframes begin to arrive. Both the
		 * per-glyph delays here and the percentages in the stylesheet are written
		 * against this one number, so the pen and the ink stay in step.
		 */
		const DRAW_END = 0.42;

		const GLYPH_DATA = {
		  upem: 1100,
		  ink: [-3.0, -206, 7166.0, 859],
		  glyphs: [
		    "M-3.0 118 72.0 155Q90.0 114 130.0 88.5Q170.0 63 214.0 63Q264.0 63 301.0 91.5Q338.0 120 358.0 170.5Q378.0 221 378.0 285Q377.0 310 370.0 330.5Q363.0 351 348.0 377Q302.0 326 233.0 292.0Q164.0 258 96.0 253L86.0 331Q147.0 333 206.0 364.0Q265.0 395 300.0 442Q276.0 467 262.0 494.5Q248.0 522 249.0 543Q247.0 582 272.0 607.0Q297.0 632 338.0 632Q380.0 632 403.5 607.5Q427.0 583 427.0 543Q427.0 522 419.5 497.5Q412.0 473 398.0 452Q458.0 368 458.0 288Q458.0 230 445.0 186.0Q432.0 142 399.0 100Q469.0 135 500.0 170L548.0 117Q504.0 58 411.5 22.0Q319.0 -14 217.0 -14Q144.0 -14 86.0 21.5Q28.0 57 -3.0 118ZM362.0 548Q362.0 561 355.5 568.5Q349.0 576 337.0 577Q326.0 577 319.5 570.0Q313.0 563 313.0 551Q313.0 536 320.0 521.5Q327.0 507 342.0 487Q354.0 506 358.0 520.0Q362.0 534 362.0 548Z",
		    "M1155.0 32Q1141.0 11 1109.5 -1.5Q1078.0 -14 1045.0 -14Q1008.0 -14 985.0 5.0Q962.0 24 962.0 56Q961.0 96 981.0 181.5Q1001.0 267 1040.0 398Q1055.0 448 1055.0 480Q1055.0 555 976.0 555Q934.0 555 883.5 512.0Q833.0 469 793.0 404.0Q753.0 339 741.0 279L682.0 0H599.0L768.0 800H851.0L789.0 507Q833.0 567 882.5 599.5Q932.0 632 984.0 632Q1137.0 632 1137.0 500Q1137.0 452 1118.0 389Q1045.0 149 1044.0 84Q1045.0 74 1052.0 68.5Q1059.0 63 1070.0 63Q1082.0 63 1095.5 73.0Q1109.0 83 1119.0 99Z",
		    "M1677.0 166 1716.0 97Q1666.0 47 1592.5 16.5Q1519.0 -14 1454.0 -14Q1404.0 -14 1364.5 9.0Q1325.0 32 1302.0 73.5Q1279.0 115 1278.0 168Q1248.0 156 1237.0 144L1203.0 210Q1219.0 236 1282.0 258Q1294.0 371 1337.0 455.5Q1380.0 540 1448.0 586.0Q1516.0 632 1601.0 632Q1670.0 632 1707.5 596.5Q1745.0 561 1745.0 492Q1745.0 406 1690.0 349.5Q1635.0 293 1562.5 263.0Q1490.0 233 1380.0 201L1358.0 195V176Q1358.0 128 1389.5 97.0Q1421.0 66 1467.0 66Q1519.0 66 1577.5 94.0Q1636.0 122 1677.0 166ZM1366.0 281Q1462.0 305 1520.0 325.0Q1578.0 345 1621.5 384.0Q1665.0 423 1665.0 484Q1665.0 517 1644.5 536.0Q1624.0 555 1593.0 555Q1507.0 555 1446.0 481.0Q1385.0 407 1366.0 281Z",
		    "M2252.0 147 2315.0 101Q2280.0 49 2228.5 17.5Q2177.0 -14 2128.0 -14Q2071.0 -14 2034.0 22.0Q1997.0 58 1989.0 119Q1890.0 45 1779.0 -1L1752.0 69Q1879.0 122 1987.0 219Q1990.0 509 2040.5 661.5Q2091.0 814 2197.0 814Q2252.0 814 2284.0 776.0Q2316.0 738 2316.0 670Q2316.0 546 2249.0 418.0Q2182.0 290 2067.0 184Q2069.0 131 2088.0 97.0Q2107.0 63 2135.0 63Q2163.0 63 2196.5 87.0Q2230.0 111 2252.0 147ZM2067.0 299Q2145.0 387 2189.0 483.5Q2233.0 580 2233.0 666Q2233.0 703 2222.5 719.5Q2212.0 736 2189.0 736Q2157.0 736 2130.5 677.5Q2104.0 619 2087.5 519.0Q2071.0 419 2067.0 299Z",
		    "M2852.0 147 2915.0 101Q2880.0 49 2828.5 17.5Q2777.0 -14 2728.0 -14Q2671.0 -14 2634.0 22.0Q2597.0 58 2589.0 119Q2490.0 45 2379.0 -1L2352.0 69Q2479.0 122 2587.0 219Q2590.0 509 2640.5 661.5Q2691.0 814 2797.0 814Q2852.0 814 2884.0 776.0Q2916.0 738 2916.0 670Q2916.0 546 2849.0 418.0Q2782.0 290 2667.0 184Q2669.0 131 2688.0 97.0Q2707.0 63 2735.0 63Q2763.0 63 2796.5 87.0Q2830.0 111 2852.0 147ZM2667.0 299Q2745.0 387 2789.0 483.5Q2833.0 580 2833.0 666Q2833.0 703 2822.5 719.5Q2812.0 736 2789.0 736Q2757.0 736 2730.5 677.5Q2704.0 619 2687.5 519.0Q2671.0 419 2667.0 299Z",
		    "M3413.0 800Q3516.0 800 3562.5 766.0Q3609.0 732 3609.0 655Q3609.0 611 3598.0 561Q3580.0 478 3551.5 431.0Q3523.0 384 3476.0 362.0Q3429.0 340 3353.0 337L3509.0 0H3414.0L3258.0 336H3171.0L3099.0 0H3015.0L3185.0 800ZM3526.0 642Q3526.0 688 3498.5 705.5Q3471.0 723 3404.0 723H3253.0L3187.0 414H3330.0Q3390.0 414 3425.0 427.5Q3460.0 441 3481.5 475.0Q3503.0 509 3517.0 575Q3526.0 616 3526.0 642Z",
		    "M4141.0 32Q4127.0 11 4095.5 -1.5Q4064.0 -14 4031.0 -14Q3995.0 -14 3972.5 4.5Q3950.0 23 3948.0 51Q3946.0 65 3948.0 69Q3919.0 31 3879.5 8.5Q3840.0 -14 3800.0 -14Q3718.0 -14 3669.0 37.0Q3620.0 88 3621.0 171Q3621.0 278 3672.5 385.5Q3724.0 493 3804.0 562.5Q3884.0 632 3963.0 632Q4042.0 632 4081.0 608.0Q4120.0 584 4120.0 530Q4120.0 516 4099.5 418.5Q4079.0 321 4034.0 112Q4030.0 90 4030.0 84Q4030.0 73 4036.0 68.0Q4042.0 63 4056.0 63Q4068.0 63 4081.5 73.0Q4095.0 83 4105.0 99ZM3988.0 258Q3997.0 305 4004.0 339.0Q4011.0 373 4016.0 396Q4039.0 505 4040.0 522Q4038.0 541 4020.0 548.0Q4002.0 555 3956.0 555Q3904.0 555 3843.5 495.5Q3783.0 436 3741.5 347.5Q3700.0 259 3700.0 178Q3701.0 126 3730.5 94.5Q3760.0 63 3807.0 63Q3858.0 63 3908.5 118.5Q3959.0 174 3988.0 258Z",
		    "M4353.0 127Q4353.0 183 4375.0 262L4435.0 475Q4438.0 487 4438.0 497Q4438.0 515 4427.0 526.0Q4416.0 537 4392.0 541L4412.0 618Q4465.0 610 4494.0 585.0Q4523.0 560 4523.0 520Q4523.0 508 4518.0 488L4456.0 262Q4437.0 195 4437.0 152Q4437.0 103 4461.5 83.0Q4486.0 63 4538.0 63Q4573.0 63 4596.0 80.0Q4619.0 97 4655.0 146L4718.0 102Q4671.0 36 4630.5 11.0Q4590.0 -14 4531.0 -14Q4440.0 -14 4396.5 18.5Q4353.0 51 4353.0 127ZM4468.0 771Q4468.0 784 4471.0 800Q4478.0 834 4494.5 846.5Q4511.0 859 4547.0 859Q4582.0 859 4596.5 850.0Q4611.0 841 4611.0 818Q4611.0 804 4607.0 789Q4600.0 755 4584.0 742.0Q4568.0 729 4532.0 729Q4497.0 729 4482.5 738.5Q4468.0 748 4468.0 771Z",
		    "M5363.0 32Q5350.0 12 5318.0 -1.0Q5286.0 -14 5253.0 -14Q5216.0 -14 5194.0 5.0Q5172.0 24 5171.0 56Q5169.0 102 5189.0 194.5Q5209.0 287 5248.0 399Q5265.0 447 5265.0 483Q5265.0 519 5247.0 537.0Q5229.0 555 5195.0 555Q5157.0 555 5109.0 514.0Q5061.0 473 5022.5 411.5Q4984.0 350 4972.0 293L4911.0 0H4827.0L4938.0 517Q4938.0 519 4939.5 523.0Q4941.0 527 4941.0 530Q4941.0 541 4934.0 548.0Q4927.0 555 4916.0 555Q4907.0 555 4896.0 548.0Q4885.0 541 4865.0 524L4831.0 586Q4844.0 606 4875.5 619.0Q4907.0 632 4940.0 632Q4976.0 632 5001.0 610.5Q5026.0 589 5026.0 556Q5026.0 542 5022.0 530L5014.0 502Q5057.0 563 5106.5 597.5Q5156.0 632 5202.0 632Q5273.0 632 5310.5 598.5Q5348.0 565 5348.0 501Q5348.0 453 5327.0 390Q5248.0 151 5253.0 84Q5253.0 74 5260.0 68.5Q5267.0 63 5278.0 63Q5291.0 63 5304.0 72.5Q5317.0 82 5328.0 99Z",
		    "M5553.0 127Q5553.0 183 5575.0 262L5635.0 475Q5638.0 487 5638.0 497Q5638.0 515 5627.0 526.0Q5616.0 537 5592.0 541L5612.0 618Q5665.0 610 5694.0 585.0Q5723.0 560 5723.0 520Q5723.0 508 5718.0 488L5656.0 262Q5637.0 195 5637.0 152Q5637.0 103 5661.5 83.0Q5686.0 63 5738.0 63Q5773.0 63 5796.0 80.0Q5819.0 97 5855.0 146L5918.0 102Q5871.0 36 5830.5 11.0Q5790.0 -14 5731.0 -14Q5640.0 -14 5596.5 18.5Q5553.0 51 5553.0 127ZM5668.0 771Q5668.0 784 5671.0 800Q5678.0 834 5694.5 846.5Q5711.0 859 5747.0 859Q5782.0 859 5796.5 850.0Q5811.0 841 5811.0 818Q5811.0 804 5807.0 789Q5800.0 755 5784.0 742.0Q5768.0 729 5732.0 729Q5697.0 729 5682.5 738.5Q5668.0 748 5668.0 771Z",
		    "M6563.0 32Q6550.0 12 6518.0 -1.0Q6486.0 -14 6453.0 -14Q6416.0 -14 6394.0 5.0Q6372.0 24 6371.0 56Q6369.0 102 6389.0 194.5Q6409.0 287 6448.0 399Q6465.0 447 6465.0 483Q6465.0 519 6447.0 537.0Q6429.0 555 6395.0 555Q6357.0 555 6309.0 514.0Q6261.0 473 6222.5 411.5Q6184.0 350 6172.0 293L6111.0 0H6027.0L6138.0 517Q6138.0 519 6139.5 523.0Q6141.0 527 6141.0 530Q6141.0 541 6134.0 548.0Q6127.0 555 6116.0 555Q6107.0 555 6096.0 548.0Q6085.0 541 6065.0 524L6031.0 586Q6044.0 606 6075.5 619.0Q6107.0 632 6140.0 632Q6176.0 632 6201.0 610.5Q6226.0 589 6226.0 556Q6226.0 542 6222.0 530L6214.0 502Q6257.0 563 6306.5 597.5Q6356.0 632 6402.0 632Q6473.0 632 6510.5 598.5Q6548.0 565 6548.0 501Q6548.0 453 6527.0 390Q6448.0 151 6453.0 84Q6453.0 74 6460.0 68.5Q6467.0 63 6478.0 63Q6491.0 63 6504.0 72.5Q6517.0 82 6528.0 99Z",
		    "M6596.0 -124Q6596.0 -82 6642.0 -52.0Q6688.0 -22 6773.5 -5.5Q6859.0 11 6973.0 11Q6981.0 27 6991.0 67L6997.0 90Q6972.0 69 6926.0 57.5Q6880.0 46 6835.0 46Q6753.0 46 6703.0 93.0Q6653.0 140 6653.0 218Q6651.0 318 6704.5 414.0Q6758.0 510 6842.0 571.0Q6926.0 632 7009.0 632Q7088.0 632 7127.5 608.5Q7167.0 585 7166.0 533Q7166.0 510 7144.0 398.5Q7122.0 287 7094.5 169.5Q7067.0 52 7051.0 9Q7074.0 10 7092.5 14.0Q7111.0 18 7143.0 28L7118.0 -52Q7085.0 -64 7016.0 -66Q6973.0 -130 6891.0 -168.0Q6809.0 -206 6715.0 -206Q6661.0 -206 6628.0 -183.5Q6595.0 -161 6596.0 -124ZM7025.0 221 7062.0 401Q7085.0 508 7086.0 522Q7085.0 538 7078.5 545.0Q7072.0 552 7056.0 553.5Q7040.0 555 7002.0 555Q6946.0 555 6882.0 505.5Q6818.0 456 6775.0 379.5Q6732.0 303 6732.0 229Q6732.0 181 6762.5 152.0Q6793.0 123 6842.0 123Q6907.0 123 6942.5 130.0Q6978.0 137 6997.5 157.5Q7017.0 178 7025.0 221ZM6912.0 -67Q6817.0 -72 6747.5 -87.0Q6678.0 -102 6677.0 -117Q6677.0 -121 6694.5 -125.0Q6712.0 -129 6734.0 -129Q6782.0 -129 6829.5 -112.0Q6877.0 -95 6912.0 -67Z",
		  ],
		};

		/** Inject a stylesheet once per document. Safe to call at any boot stage. */
		function ensureStyles() {
			const id = "dsh-shellraining-brand-styles";
			if (document.getElementById(id) !== null) return;

			// This bundle is marked `immediately`, so its factory can run before the
			// document has a <head> (and, in tests, with no document at all).
			// Styling is cosmetic, so a hostile environment must not be allowed to
			// throw here: that would abort apply() and leave every brand slot
			// unregistered. Fall back to installing the rules on documentElement.
			const host = document.head ?? document.documentElement;
			if (host === undefined || host === null) return;

			const style = document.createElement("style");
			style.id = id;
			style.textContent = `
/* Hide the hero's own headline and "Preview" badge, leaving only our mark.
   These strings (hero.headline / hero.preview) are rendered by the
   conversation package's own markup, and the locale registry allows one owner
   per (namespace, locale), so they cannot be replaced by dictionary
   registration. Their CSS-module class names are content-hashed and change
   between builds, so this anchors on our own attribute instead.

   Real DOM shape (conversation HeroShell):
     div.headline
     ├── span.fishHitbox      <- the slot; our mark renders inside it
     └── span.titleGroup      <- headline text + "Preview" badge
   So: find the headline row that contains our mark, then hide every sibling
   span that follows the mark's own span. Descendant combinators on both sides
   keep this working regardless of how many wrapper elements the slot renderer
   introduces around our mark, and regardless of whether the mark's element is
   the outermost node the slot renders or one level inside it. */
div:has([data-shellraining-hero]) > span:has([data-shellraining-hero]) + span,
div:has([data-shellraining-hero]) > [data-shellraining-hero] + span {
  display: none !important;
}

/* The hero hands the slot its own \`fish\` class, whose swimming keyframes rotate
   and nudge the element. Those are tuned for the official glyph and read as the
   wordmark jittering or losing part of itself at the row edge, so the hero mark
   opts out. overflow stays visible so the wide word can spill out of the square
   hitbox the host sized for the glyph.

   The animation kill must not match the wordmark itself, because the wordmark
   carries its own write animation and an !important \`animation: none\` here would
   cancel it. Excluding the mark keeps the override on the host's wrapper only. */
:where([data-shellraining-hero]):not([data-shellraining-mark]) {
  animation: none !important;
}

:where([data-shellraining-hero]) {
  overflow: visible !important;
}

/* Brand wordmark: drawn by a pen, then settled into solid type.
   Colour comes from the theme's brand token, which in evergarden is its green
   accent.

   Each glyph is rendered twice: a stroke layer the pen draws, and a fill layer
   underneath that fades in once the outline is complete. Drawing only the
   outline leaves hollow glowing letters, which reads as neon signage; letting
   the solid letterform arrive as the stroke finishes matches how ink actually
   behaves and is what the reference implementation's masked shape produces. */
[data-shellraining-mark="wordmark"] {
  color: var(--dsw-alias-brand-primary);
  display: block;
}

[data-shellraining-mark="wordmark"] svg {
  display: block;
  overflow: visible;
}

/* The solid letterform. It is invisible until the pen has passed, then fades in
   and stays for the rest of the cycle. The soft cast is a single, restrained
   drop-shadow: the point is ink with a little light around it, not a lamp. */
[data-shellraining-mark="wordmark"] .sr-fill {
  fill: currentColor;
  stroke: none;
  opacity: 0;
  filter: drop-shadow(0 0 6px color-mix(in srgb, currentColor 30%, transparent));
}

/* The pen. linecap is butt, not round: a round cap paints a visible dot even
   for a zero-length dash, which leaves stray specks on every subpath before the
   animation starts. The stroke is also fully transparent until the draw begins
   so nothing is painted in the first frame. */
[data-shellraining-mark="wordmark"] .sr-stroke {
  fill: none;
  stroke: currentColor;
  stroke-linecap: butt;
  stroke-linejoin: round;
  stroke-dasharray: 0 20000;
  opacity: 0;
}

/* Draw then settle, as one shared timeline.
   Every glyph runs the same two animations for the same full cycle; each glyph's
   own offset into that timeline arrives as a NEGATIVE delay, so glyph N starts
   already part-way through its keyframes at the moment the group begins. That is
   what lets one keyframe pair drive twelve glyphs at staggered moments without
   per-glyph rules.

   The draw window is the first 42% of the cycle; the remainder is the hold on the
   settled word. Because every glyph shares one cycle length, the glyph offsets
   stay proportional to outline length and the pen keeps a constant speed. */
[data-shellraining-mark="wordmark"][data-shellraining-draw="on"] .sr-stroke,
[data-shellraining-mark="wordmark"][data-shellraining-draw="on"] .sr-fill {
  animation-duration: var(--sr-cycle, 7s);
  animation-delay: var(--sr-delay, 0s);
  animation-iteration-count: infinite;
}

/* The pen holds a constant speed, so its easing is linear. */
[data-shellraining-mark="wordmark"][data-shellraining-draw="on"] .sr-stroke {
  animation-name: shellraining-pen;
  animation-timing-function: linear;
}

/* The ink instead eases in and out, which is what makes the arrival and the
   dissolve feel soft rather than mechanical. */
[data-shellraining-mark="wordmark"][data-shellraining-draw="on"] .sr-fill {
  animation-name: shellraining-settle;
  animation-timing-function: ease-in-out;
}

/* The pen: hidden, then drawing from nothing to this glyph's full outline, then
   handing over to the fill. 42% is the end of the whole draw window, so a glyph
   whose negative delay already placed it late in the word is drawn late.

   Every stage that ends must also START at that same value, and the last frame
   must match the first. A keyframe loop jumps straight from 100% back to 0% with
   no interpolation between iterations, so a cycle that ends at full opacity
   snaps off the moment it repeats. Ending the cycle already faded out makes the
   wrap invisible. */
@keyframes shellraining-pen {
  0% {
    opacity: 0;
    stroke-dasharray: 0 20000;
  }
  1% {
    opacity: 1;
    stroke-dasharray: 0 20000;
  }
  /* Draw finishes at this glyph's share of the 42% draw window. */
  42% {
    opacity: 1;
    stroke-dasharray: var(--sr-len, 20000) 20000;
  }
  /* Hold the finished outline a beat, then hand over to the fill underneath. */
  55% {
    opacity: 0;
    stroke-dasharray: var(--sr-len, 20000) 20000;
  }
  100% {
    opacity: 0;
    stroke-dasharray: var(--sr-len, 20000) 20000;
  }
}

/* The solid letterform: arrives as the outline closes, holds while the word is
   whole, then dissolves so the next pass starts from a blank page.
   The dissolve is the last fifth of the cycle and it eases rather than ramps, so
   the ink lifts off softly instead of blinking away, and because it reaches 0
   before 100% the repeat is continuous. */
@keyframes shellraining-settle {
  0% {
    opacity: 0;
  }
  /* Opaque by the time the pen finishes this glyph, so the letter looks inked. */
  42% {
    opacity: 1;
  }
  /* Hold the finished word for most of the cycle. */
  78% {
    opacity: 1;
  }
  /* Dissolve back to nothing before the cycle wraps. */
  100% {
    opacity: 0;
  }
}

/* Respect the reduced-motion preference: show the settled word, no pen. */
@media (prefers-reduced-motion: reduce) {
  [data-shellraining-mark="wordmark"][data-shellraining-draw="on"] .sr-stroke {
    animation: none;
    opacity: 0;
  }
  [data-shellraining-mark="wordmark"][data-shellraining-draw="on"] .sr-fill {
    animation: none;
    opacity: 1;
  }
}
`;
			host.appendChild(style);
		}

		/**
		 * Render the brand avatar.
		 *
		 * The source images are square, opaque, and drawn on a light background, so
		 * the mark is a circular clip rather than a plain image box: a bare square
		 * avatar would read as a stray photo against the sidebar surface. A hairline
		 * ring in the theme's border colour separates the light artwork from a light
		 * theme without tinting the artwork itself.
		 *
		 * @param props.size - square edge in pixels supplied by the host slot.
		 * @param props.src - avatar source; the sidebar passes the still and the hero
		 *   the animated rendition.
		 * @param props.round - corner rounding; when false the mark keeps a rounded
		 *   square frame, used where the artwork is not a portrait crop.
		 * @returns the avatar mark.
		 */
		function ShellRainingAvatar({ size, src, round }) {
			ensureStyles();
			const edge = typeof size === "number" && size > 0 ? size : 24;

			return h("img", {
				"data-shellraining-mark": "avatar",
				src,
				alt: NAME,
				title: NAME,
				width: edge,
				height: edge,
				draggable: false,
				decoding: "async",
				style: {
					display: "block",
					width: edge + "px",
					height: edge + "px",
					// The source is opaque with a light backdrop; cover keeps the
					// subject centred at any box size without letterboxing.
					objectFit: "cover",
					objectPosition: "center",
					borderRadius: round === false ? Math.round(edge * 0.22) + "px" : "50%",
					// --dsw-alias-border-l2 is the stronger of the two subtle borders,
					// which is what stays visible around light artwork in light mode.
					boxShadow: "inset 0 0 0 1px var(--dsw-alias-border-l2)",
					flex: "none",
					userSelect: "none",
					pointerEvents: "none",
				},
			});
		}

		/**
		 * Sidebar mark occupant.
		 *
		 * The sidebar renders this mark and the separate `sidebar.brand.name`
		 * occupant side by side, so the avatar is sized to the 24px box the shell
		 * allocates and the name sits beside it.
		 */
		function SidebarMark({ size }) {
			return h(ShellRainingAvatar, { size, src: AVATAR_STILL });
		}

		/**
		 * Render the brand word as stroke-drawn SVG outlines.
		 *
		 * The word is real glyph geometry rather than live text, because the write
		 * animation animates stroke-dasharray along those paths and stroke-dasharray
		 * has no effect on SVG <text>. Drawing the outlines also means the mark
		 * renders identically wherever Victor Mono is or is not installed.
		 *
		 * @param props.size - square edge in pixels supplied by the host slot. The
		 *   word is wider than tall, so it overflows that box horizontally by design.
		 * @param props.hero - marks the hero rendition, which the stylesheet uses to
		 *   find and suppress the headline text the host renders beside the slot.
		 * @returns the SVG wordmark.
		 */
		function ShellRainingWordmark({ size, hero }) {
			ensureStyles();
			const edge = typeof size === "number" && size > 0 ? size : 24;

			// Height of the drawn word in px. The glyph box is ~6.4:1, so deriving
			// height from the slot edge and letting width follow keeps the mark's
			// visual weight proportional in both the hero and the sidebar.
			const height = Math.round(edge * 1.05);

			const [ix0, iy0, ix1, iy1] = GLYPH_DATA.ink;
			const scale = height / (iy1 - iy0);
			const width = Math.round((ix1 - ix0) * scale);
			// viewBox in font units, y flipped by the group transform below. The
			// small padding keeps stroke ends from being clipped by the viewport.
			const pad = 20;
			const vbX = ix0 - pad;
			const vbY = -iy1 - pad;
			const vbW = ix1 - ix0 + pad * 2;
			const vbH = iy1 - iy0 + pad * 2;

			const ref = React.useRef(null);
			const [drawKey, setDrawKey] = React.useState(0);

			// Measure each outline once mounted, then publish the timing as CSS
			// custom properties. Measuring rather than hardcoding keeps the
			// animation correct if the artwork is ever replaced, and deriving each
			// glyph's slot from the outline before it makes the pen travel across
			// the word at one constant speed.
			React.useEffect(() => {
				const node = ref.current;
				if (node === null) return;
				// Only the pen layer carries the measurement; the fill layer is the
				// same geometry and inherits the timing from its sibling.
				const strokes = node.querySelectorAll(".sr-stroke");
				if (strokes.length === 0) return;

				// Pass one: every outline's length. The whole timeline is expressed
				// as percentages of one cycle, so the total must be known first.
				const lengths = [];
				let total = 0;
				for (let i = 0; i < strokes.length; i += 1) {
					const len = typeof strokes[i].getTotalLength === "function"
						? strokes[i].getTotalLength()
						: 0;
					lengths.push(len > 0 ? len : 0);
					total += len > 0 ? len : 0;
				}
				if (total <= 0) return;

				// Timeline layout inside one cycle, matching the keyframes above: the
				// pen draws across DRAW_SHARE of the cycle, and the remainder is the
				// hold, during which the settled word is left on screen before the
				// cycle repeats. Each glyph occupies DRAW_SHARE in proportion to its
				// own outline length, so the pen speed stays even.
				let prefix = 0;
				const fills = node.querySelectorAll(".sr-fill");
				for (let i = 0; i < strokes.length; i += 1) {
					const len = lengths[i];
					if (len <= 0) continue;
					const startFraction = prefix / total;

					// Delay each glyph so the pen reaches it exactly when its share of
					// the word begins, which makes the word draw left to right.
					//
					// With cycle C and delay d, an animation is at fraction F of its
					// timeline at wall time t = F*C + d. The keyframes finish drawing at
					// F = DRAW_END, and this glyph must finish drawing at
					// t = startFraction * DRAW_SHARE * C, so
					//   d = (startFraction * DRAW_SHARE - DRAW_END) * C
					// The value is negative for the first glyphs, which is the point:
					// a negative delay starts an animation already part-way through,
					// so all twelve glyphs share one keyframe pair and differ only by
					// where in the cycle they begin. Ordering the delay by measured
					// prefix length (not by index) keeps the pen at a constant speed
					// across letters of different outline complexity.
					const delay = (
						(startFraction * DRAW_SHARE - DRAW_END) * CYCLE_MS
					).toFixed(0);
					for (const layer of [strokes[i], fills[i]]) {
						if (layer === undefined) continue;
						layer.style.setProperty("--sr-cycle", CYCLE_MS + "ms");
						layer.style.setProperty("--sr-delay", delay + "ms");
						if (layer === strokes[i]) {
							layer.style.setProperty("--sr-len", String(len));
						}
					}
					prefix += len;
				}
				setDrawKey(1);
			}, []);

			// Two layers per glyph: the pen draws the outline, and the solid
			// letterform fades in behind it once the outline closes.
			const children = GLYPH_DATA.glyphs.map((d, i) =>
				h("g", { key: i }, [
					h("path", { key: "f", className: "sr-fill", d }),
					h("path", { key: "s", className: "sr-stroke", d }),
				]),
			);

			return h(
				"span",
				{
					...(hero === true ? { "data-shellraining-hero": "true" } : {}),
					"data-shellraining-mark": "wordmark",
					...(drawKey === 1 ? { "data-shellraining-draw": "on" } : {}),
					title: NAME,
					ref,
					style: {
						display: "block",
						width: width + "px",
						height: height + "px",
						userSelect: "none",
					},
				},
				h(
					"svg",
					{
						xmlns: "http://www.w3.org/2000/svg",
						viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
						width: "100%",
						height: "100%",
						// Stroke width scales with the glyph box so the drawn line keeps
						// its intended weight at any rendered size. The ratio is kept
						// light deliberately: the outline is meant to read as a drawn
						// line, and a heavier stroke closes up the counters inside
						// letters like e, a and g until the word looks like solid type.
						strokeWidth: Math.max(6, Math.round(vbH * 0.014)),
						fill: "none",
						role: "img",
						"aria-label": NAME,
					},
					h("g", { transform: "scale(1,-1)" }, children),
				),
			);
		}

		/**
		 * Hero mark occupant: the italic wordmark, with the host's own headline and
		 * "Preview" badge suppressed by the stylesheet so the word stands alone.
		 *
		 * @param props.size - square edge supplied by the hero slot (34px).
		 * @returns the hero wordmark.
		 */
		function HeroMark({ size }) {
			return h(ShellRainingWordmark, { size, hero: true });
		}

		/**
		 * Sidebar name occupant: the text beside the mark in the expanded row.
		 *
		 * The shell's own `brandName` rule already supplies 18px/24px type, so this
		 * only overrides the face, not the metric.
		 *
		 * @returns the styled brand name.
		 */
		function SidebarName() {
			ensureStyles();
			return h(
				"span",
				{
					"data-shellraining-mark": "name",
					style: {
						fontFamily: FONT_STACK,
						fontStyle: "italic",
						fontWeight: 500,
						letterSpacing: "0.01em",
						whiteSpace: "nowrap",
					},
					title: NAME,
				},
				NAME,
			);
		}

		exports.name = "dsh-shellraining-brand";
		/** Required services: the slot registry. */
		exports.inject = ["slots"];

		/**
		 * Shadowing priority for the brand seats.
		 *
		 * These are `single` slots, and the shipped brand package already occupies
		 * them at the default priority 0. SlotCore rejects a second registration at
		 * an occupied priority, and among occupants the LOWEST priority renders. A
		 * negative value therefore both avoids the conflict and wins the cell, so
		 * this package replaces the official mark instead of silently losing to it.
		 */
		const SHADOW_PRIORITY = -1;

		/**
		 * Claim the brand slots. Each registration waits on its declaring package
		 * through `ctx.slots.inject`, so it takes effect whether this row activates
		 * before or after the declaration, and withdraws cleanly when either side
		 * unloads. The three seats are injected independently so each keeps its own
		 * lifecycle.
		 *
		 * @param ctx - client root context.
		 */
		exports.apply = (ctx) => {
			// Register before styling: the registrations are the feature, the
			// stylesheet is decoration, and each occupant calls ensureStyles() on
			// render anyway. A styling failure must never cost us the slots.
			ctx.slots.inject("sidebar.brand.mark", () =>
				ctx.slots.register(
					{ name: "sidebar.brand.mark", priority: SHADOW_PRIORITY },
					SidebarMark,
				),
			);

			ctx.slots.inject("sidebar.brand.name", () =>
				ctx.slots.register(
					{ name: "sidebar.brand.name", priority: SHADOW_PRIORITY },
					SidebarName,
				),
			);

			ctx.slots.inject("conversation.hero.brand.mark", () =>
				ctx.slots.register(
					{
						name: "conversation.hero.brand.mark",
						priority: SHADOW_PRIORITY,
					},
					HeroMark,
				),
			);

			ensureStyles();
		};

		return module.exports;
	},
});
