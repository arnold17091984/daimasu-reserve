// --- Type Definitions ---

interface BilingualText {
  ja: string;
  en: string;
}

interface NavItem {
  label: string;
  labelEn: string;
  href: string;
}

interface Aesthetic {
  principle: BilingualText;
  description: BilingualText;
}

interface ExperienceStep {
  number: string;
  title: BilingualText;
  description: BilingualText;
  thumb?: string;
}

interface Course {
  name: BilingualText;
  craft: BilingualText;
  description: BilingualText;
  title: BilingualText;
}

interface GalleryImage {
  src: string;
  alt: BilingualText;
}

interface FaqItem {
  q: BilingualText;
  a: BilingualText;
}

// --- Constants ---

export const CURRENT_CHAPTER = {
  number: "第一章",
  name: { ja: "マスターの食卓", en: "Master Owly's Table" },
};

export const SITE = {
  name: "DAIMASU",
  subtitle: { ja: "八皿の物語 — HACHIZARA NO MONOGATARI", en: "Eight Courses, One Story" },
  tagline: {
    ja: "マスター・アウリと綴る、九十分の懐石劇場",
    en: "Ninety minutes. Eight courses. One owl with a golden feather pen.",
  },
  description: {
    ja: "8メートルの檜カウンターに八つの場面が浮かび上がる、マスター・アウリの懐石劇場。桜の庭から甘味の宵まで、一皿ごとに展開する物語と伝統の懐石料理が、九十分を一夜の記憶に綴り上げます。",
    en: "An immersive dining theatre where Master Owly guides you through eight kaiseki courses across an eight-meter hinoki counter. From cherry gardens to temple kitchens, from ocean depths to firelight — each scene unfolds as its course arrives, binding taste to story across ninety minutes.",
  },
};

export const NAV_ITEMS: NavItem[] = [
  { label: "体験", labelEn: "Experience", href: "#experience" },
  { label: "物語", labelEn: "Story", href: "#journey" },
  { label: "お品書き", labelEn: "Course", href: "#menu" },
  { label: "ご案内", labelEn: "Info", href: "#info" },
];

export const AESTHETICS: Aesthetic[] = [
  {
    principle: { ja: "物語と料理の融合", en: "Story Meets Cuisine" },
    description: {
      ja: "一皿ごとにマスター・アウリの物語が始まります。黄金の単眼鏡を掛けた梟が、桜の庭で、蒸籠の霧で、深き海の底で — 料理が届くその瞬間、物語は風景となり、風景は味覚となります。",
      en: "Each course opens with a tale of Master Owly. The monocled owl with his golden feather pen appears in cherry gardens, under steamer mist, in the deep blue sea. When the dish arrives, story becomes scene, and scene becomes flavor.",
    },
  },
  {
    principle: { ja: "8メートルの舞台", en: "The 8-Meter Stage" },
    description: {
      ja: "8メートルの檜カウンターが、八つの情景を受け止める舞台となります。映像は料理の前触れとなり、料理は映像の締めくくりとなります。",
      en: "An eight-meter hinoki counter transforms into the stage for eight scenes. The projection heralds each dish; the dish answers each projection. Counter as canvas, counter as kitchen.",
    },
  },
  {
    principle: { ja: "九十分の献立", en: "Ninety-Minute Kaiseki" },
    description: {
      ja: "伝統懐石のリズムを九十分に凝縮。先付から甘味まで八皿を通して、物語と余韻、緊張と解放が絶え間なく流れ続けます。",
      en: "The traditional kaiseki rhythm distilled into ninety minutes. From sakizuke to sweet finale, across eight courses — story, stillness, tension, release. An unbroken current from first bite to last.",
    },
  },
  {
    principle: { ja: "五感への没入", en: "Five Senses Immersed" },
    description: {
      ja: "映像だけではありません。琴、尺八、蒸気の音、焚き火のはぜる音。香り、温度、食感が加わり、五感すべてでマスターの食卓を体験します。",
      en: "Not just visual. Koto strings, shakuhachi breath, steam hiss, embers popping. Aroma, temperature, texture — every sense drawn into Master Owly's table.",
    },
  },
  {
    principle: { ja: "季節の移ろい", en: "Seasonal Flow" },
    description: {
      ja: "献立と映像は、日本の四季とともに移ろいます。春の桜、夏の涼、秋の焚き火、冬の雪銀。訪れるたびに、異なる食卓が待っています。",
      en: "The menu and projections shift with Japan's seasons. Spring cherry, summer cool, autumn fire, winter silver. Each visit offers a different table — no two evenings at DAIMASU are the same.",
    },
  },
];

export const EXPERIENCE_STEPS: ExperienceStep[] = [
  {
    number: "01",
    title: { ja: "開幕", en: "Curtain Up" },
    description: {
      ja: "カウンターに着席すると、静かに『DAIMASU』の屋号が浮かび上がります。灯りが落ち、一夜の劇場が始まります。",
      en: "Take your seat. The DAIMASU crest surfaces from black and the lights dim. The theatre opens — your ninety minutes begin.",
    },
    thumb: "/images/thumb-curtain.jpg",
  },
  {
    number: "02",
    title: { ja: "物語の一皿", en: "Story Course" },
    description: {
      ja: "各コースの開始とともに、マスター・アウリの物語が1〜2分ほど展開します。見事な登場、思わぬ失敗、魔法のような解決。物語が終わるその瞬間に、一皿が目の前に届きます。",
      en: "Each course begins with a one-to-two-minute Master Owly vignette: grand entrance, clumsy mishap, magical recovery. As the tale resolves, the dish lands before you.",
    },
    thumb: "/images/thumb-story.jpg",
  },
  {
    number: "03",
    title: { ja: "余韻のひととき", en: "The Lingering" },
    description: {
      ja: "物語が収まると、カウンターは静かなアンビエントへ。桜の花びら、深海の魚影、冬の雪影。料理を味わう間、風景が呼吸するように流れ続けます。",
      en: "After the story, the counter settles into ambient imagery — drifting petals, swimming schools, falling snow. The scene breathes quietly as you dine.",
    },
    thumb: "/images/thumb-lingering.jpg",
  },
  {
    number: "04",
    title: { ja: "幕引き", en: "Farewell" },
    description: {
      ja: "八皿を終えると、マスター・アウリが静かに別れを告げます。屋号が再び浮かび、一夜の劇が閉じます。",
      en: "After the eighth course, Master Owly bows quietly. The DAIMASU crest rises once more, and the curtain falls on the evening.",
    },
    thumb: "/images/thumb-farewell.jpg",
  },
];

export const MENU_COURSES: Course[] = [
  {
    name: { ja: "先付", en: "Sakizuke" },
    craft: { ja: "桜の庭", en: "Cherry Garden" },
    description: {
      ja: "桜の花びらが風に流れる庭先。マスター・アウリが黄金の羽根ペンを手に登場し、春の気配とともに最初の一皿が届きます。出会いの季節、旅路の幕開け。",
      en: "Cherry petals drift across a quiet garden. Master Owly appears with his golden feather pen as the opening bite arrives — a delicate sakizuke carrying the first breath of spring.",
    },
    title: { ja: "桜の宵", en: "Cherry Blossom Eve" },
  },
  {
    name: { ja: "椀物", en: "Wanmono" },
    craft: { ja: "勝手口", en: "Temple Kitchen" },
    description: {
      ja: "薄暗い寺院の勝手口。吊るされた銅の杓子、鎮まる炭火、澄んだ湯気。マスター・アウリが儀式張って大鍋を覗き込んだ瞬間 — 羽根ペンが椀に吸い込まれ、見事な失敗劇が始まります。澄んだ一椀で、春の気配を確かめて。",
      en: "A dim temple kitchen — copper ladles hanging, embers glowing, clear steam rising. Master Owly leans in with ceremonial gravity, only to lose his feather pen to the broth. A clear, composed soup restores the spring.",
    },
    title: { ja: "黄金の杓子", en: "The Golden Ladle" },
  },
  {
    name: { ja: "造り", en: "Tsukuri" },
    craft: { ja: "深き蒼", en: "Indigo Depths" },
    description: {
      ja: "カウンターが海の底に沈みます。魚群が緩やかに横切り、光が深い藍の中を漂います。マスター・アウリは潜水ヘルメットを携え、三種の造りを慎ましくお届けに上がります。",
      en: "The counter sinks into the ocean floor. Schools of fish glide through the deep indigo. Master Owly, solemn in a diving helmet, delivers three sashimi selections with the gravity of a pearl diver.",
    },
    title: { ja: "深海の三種", en: "Three From the Deep" },
  },
  {
    name: { ja: "焼物", en: "Yakimono" },
    craft: { ja: "夜の焚き火", en: "Night Fire" },
    description: {
      ja: "闇夜に焚き火が爆ぜます。燃え上がる火花、仄かな煙の香り、マスター・アウリの羽毛が焦げる微かな音 — 炎の記憶とともに、完璧に焼き上げられた一皿が運ばれます。",
      en: "Flames crackle in the dark. Sparks lift, smoke curls, and somewhere in the warmth Master Owly's feathers singe briefly. From the embers, a perfectly grilled course arrives — carrying the night's first real heat.",
    },
    title: { ja: "焔の記憶", en: "Ember Memory" },
  },
  {
    name: { ja: "揚物", en: "Agemono" },
    craft: { ja: "冬の銀", en: "Winter Silver" },
    description: {
      ja: "雪が静かに降り積もります。一基の石燈籠だけが黄金色に灯り、銀の世界を照らします。その冷気の中へ、揚げたての一皿 — ひとつひとつが冬の灯となって届きます。",
      en: "Snow settles across a silver-gold landscape. A single stone lantern burns warm against the cold. Into that hush arrives the tempura — each piece a small ember in the winter dark.",
    },
    title: { ja: "雪燈籠", en: "Snow Lantern" },
  },
  {
    name: { ja: "蒸物", en: "Mushimono" },
    craft: { ja: "蒸籠の霧", en: "Mist of the Steamer" },
    description: {
      ja: "竹の蒸籠から霧が立ち上がります。マスター・アウリの単眼鏡が曇り、慌てて拭う仕草。霧の向こうから、花弁のように蓋が開かれ、蒸し立ての一皿が現れます。",
      en: "Mist rises from bamboo steamers. Master Owly's monocle fogs; he wipes it with dignified urgency. The lid lifts like a petal unfolding — and the steamed course emerges from the warm white air.",
    },
    title: { ja: "霧の献立", en: "Mist Plate" },
  },
  {
    name: { ja: "食事", en: "Shokuji" },
    craft: { ja: "寿司カウンター", en: "Sushi Counter" },
    description: {
      ja: "磨き上げられた檜のカウンター。真向かいに立つマスター・アウリの寿司装束は一分の隙もありません。一貫ずつ、礼節とともに握られ、一貫ずつ、目の前に置かれていきます。",
      en: "An immaculate hinoki counter. Master Owly stands opposite in a crisp sushi uniform. Piece by piece, with measured ceremony, the nigiri is shaped — and placed before you one at a time.",
    },
    title: { ja: "匠の一貫", en: "Master's Hand" },
  },
  {
    name: { ja: "甘味", en: "Amami" },
    craft: { ja: "甘味の宵", en: "Sweet Evening" },
    description: {
      ja: "提灯の灯が夜を温めます。一夜の物語の最後に、優しく甘い一皿が届きます。マスター・アウリは満足げに見守り、八皿の旅路が静かに閉じていきます。",
      en: "Paper lanterns warm the night. As the evening folds toward its close, a gentle sweet course arrives. Master Owly watches with quiet contentment — the eight-course journey quietly concludes.",
    },
    title: { ja: "宵の名残", en: "Evening's Remains" },
  },
];

export const GALLERY_IMAGES: GalleryImage[] = [
  {
    src: "/images/gallery-1.jpg",
    alt: { ja: "桜の庭先に佇むマスター・アウリ", en: "Master Owly beneath cherry blossoms in the opening garden" },
  },
  {
    src: "/images/gallery-2.jpg",
    alt: { ja: "寺院の勝手口で湯気が立ち上る椀物の場面", en: "Steam rising from the temple kitchen during the wanmono course" },
  },
  {
    src: "/images/gallery-3.jpg",
    alt: { ja: "深き蒼の海底で魚群が流れる造りの場面", en: "Schools of fish drifting through the indigo depths for sashimi" },
  },
  {
    src: "/images/gallery-4.jpg",
    alt: { ja: "夜の焚き火に火花が舞う焼物の場面", en: "Sparks leaping from the night campfire during the grilled course" },
  },
  {
    src: "/images/gallery-5.jpg",
    alt: { ja: "雪降る冬の銀の石燈籠と揚物", en: "Stone lantern glowing in a snow-silver winter for tempura" },
  },
  {
    src: "/images/gallery-6.jpg",
    alt: { ja: "寿司カウンターに立つマスター・アウリ", en: "Master Owly at the hinoki sushi counter" },
  },
];

export const MAIN_SITE_URL = "https://daimasu.com.ph";

export const COURSE_PRICE = {
  amount: "₱8,000",
  note: { ja: "お一人様 / 税・サ別", en: "per guest / tax & service not included" },
};

export const COURSE_META = {
  courses: 8,
  minutes: 90,
  counterMeters: 8,
  seats: 8,
};

export const SOCIAL_LINKS = [
  { name: "Instagram", href: "https://www.instagram.com/daimasu_makati", handle: "@daimasu_makati" },
  { name: "Facebook", href: "https://www.facebook.com/DaimasuMakati", handle: "DaimasuMakati" },
];

export const CONTACT = {
  address: {
    full: {
      ja: "〒1231 メトロマニラ マカティ市 Chino Roces Ave 2284, Allegro Center, 1階 Unit A-1/2/3",
      en: "Unit A-1/2/3, Ground Floor, Allegro Center, 2284 Chino Roces Ave, Makati City, 1231 Metro Manila",
    },
    short: {
      ja: "Allegro Center, Chino Roces Ave, マカティ",
      en: "Allegro Center, Chino Roces Ave, Makati",
    },
  },
  phone: {
    landline: { label: "(02) 7121 5200", tel: "+6327121520" },
    mobile: { label: "0917 109 6032", tel: "+639171096032" },
  },
  whatsapp: {
    label: "0917 109 6032",
    href: "https://wa.me/639171096032",
    /** Pre-filled reservation inquiry — used by the Hero CTA and the Reservation section */
    reservationHref:
      "https://wa.me/639171096032?text=" +
      encodeURIComponent(
        "Hi DAIMASU — I'd like to make a reservation. Preferred date / seating / party size: "
      ),
  },
  viber: {
    label: "0917 109 6032",
    /** Opens a direct Viber chat (if Viber is installed). */
    href: "viber://chat?number=%2B639171096032",
  },
  email: "daimasumakati@gmail.com",
  restaurantHours: {
    ja: "11:00〜24:00 (毎日営業)",
    en: "11:00–24:00 · open daily",
  },
  // Use www.google.com (not maps.google.com) — the site CSP only whitelists
  // www.google.com under frame-src. The maps subdomain was blocked, so the
  // iframe rendered as the broken-image placeholder on the contact card.
  // This URL form is supported by Google Maps for embedding without an API key.
  mapEmbedUrl:
    "https://www.google.com/maps?q=14.5363194,121.0201423&z=17&hl=en&output=embed",
  mapLinkUrl:
    "https://www.google.com/maps/place/DAIMASU+JAPANESE+RESTAURANT/@14.5363194,121.0201423,17z",
};

export const OPENING_DATE = {
  iso: "2026-04-20",
  label: { ja: "2026年4月20日", en: "April 20, 2026" },
};

/**
 * Trust signals displayed in the Info section — address / hours /
 * cancellation policy. Address & map reuse the authoritative values in
 * CONTACT above; this constant only adds what wasn't there before
 * (kaiseki-seating hours summary, cancellation policy).
 */
export const RESTAURANT_INFO = {
  address: {
    en: CONTACT.address.full.en,
    ja: CONTACT.address.full.ja,
  },
  hours: {
    en: "Tuesday – Sunday · 17:30 / 20:00 seatings · Closed Mondays",
    ja: "火〜日・17:30/20:00 の二部制・月曜定休",
  },
  cancellation: {
    en: "Full refund up to 48 hours before service. 50% refund 24–48 hours before. No refund within 24 hours; no-shows are charged in full.",
    ja: "ご来店48時間前までのキャンセルは全額返金。24〜48時間前のキャンセルは50%返金。24時間を切ってからのキャンセル・当日ご不来場は全額申し受けます。",
  },
  // Used when RESERVATIONS_DEPOSIT_REQUIRED=false. The deposit-flow copy
  // above mentions refunds and no-show charges that don't apply when
  // there's no payment to refund — would mislead guests in the deposit-
  // free deployment.
  cancellationDepositFree: {
    en: "Plans change — cancel any time via the link in your confirmation email. No deposit, no cancellation fee.",
    ja: "ご都合が変わった場合、確認メール内のキャンセルリンクから 24 時間 365 日承ります。デポジット・キャンセル料はございません。",
  },
  mapEmbedUrl: CONTACT.mapEmbedUrl,
  mapPinHref: CONTACT.mapLinkUrl,
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: {
      ja: "写真・動画撮影はできますか？",
      en: "Can I take photos or videos?",
    },
    a: {
      ja: "はい、お料理や映像の撮影は自由です。ただし、フラッシュ撮影はご遠慮ください。",
      en: "Yes, you are welcome to photograph food and projections. Please refrain from using flash.",
    },
  },
  {
    q: {
      ja: "ドレスコードはありますか？",
      en: "Is there a dress code?",
    },
    a: {
      ja: "スマートカジュアルをお願いしております。",
      en: "Smart casual is recommended.",
    },
  },
  {
    q: {
      ja: "アレルギー対応はできますか？",
      en: "Can you accommodate dietary restrictions?",
    },
    a: {
      ja: "事前にお知らせいただければ対応いたします。ご予約時にお申し付けください。",
      en: "Please inform us at the time of booking, and we will accommodate your needs.",
    },
  },
  {
    q: {
      ja: "何歳から利用できますか？",
      en: "Is there a minimum age?",
    },
    a: {
      ja: "12歳以上のお客様にご利用いただけます。",
      en: "Guests aged 12 and above are welcome.",
    },
  },
  {
    q: {
      ja: "予約なしでも入れますか？",
      en: "Can I walk in without a reservation?",
    },
    a: {
      ja: "完全予約制です。お席に限りがございますので、事前のご予約をお願いいたします。",
      en: "Reservation only. Due to limited seating, advance booking is required.",
    },
  },
];
