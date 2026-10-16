/**
 * 管理员建号、重设密码时自动生成的密码：3 个常用英文短词加 2 位数字，比如 "maple-otter-sunny-42"。
 * 朋友要在手机上照着输，所以只用小写字母、数字和连字符。词表正好 256 个，一个随机字节选一个词，没有偏差；
 * 一共约 31 bit，在线猜有登录失败锁挡着，发出去以后让对方登录后自己改（5.1）。
 */
const WORDS = [
  'apple', 'river', 'stone', 'cloud', 'tiger', 'panda', 'lemon', 'mango', 'ocean', 'piano', 'rocket', 'candy', 'tulip',
  'maple', 'cedar', 'pearl', 'coral', 'amber', 'olive', 'peach', 'berry', 'grape', 'melon', 'cherry', 'bread', 'honey',
  'sugar', 'salt', 'pepper', 'ginger', 'cocoa', 'toast', 'pizza', 'noodle', 'bagel', 'donut', 'cookie', 'waffle', 'pancake',
  'jelly', 'table', 'chair', 'sofa', 'lamp', 'clock', 'door', 'window', 'garden', 'forest', 'meadow', 'valley', 'canyon',
  'island', 'beach', 'desert', 'planet', 'comet', 'star', 'moon', 'sun', 'rain', 'snow', 'storm', 'wind', 'frost',
  'spring', 'summer', 'autumn', 'winter', 'dawn', 'noon', 'dusk', 'night', 'lake', 'pond', 'creek', 'brook', 'hill',
  'cliff', 'cave', 'horse', 'zebra', 'camel', 'llama', 'koala', 'otter', 'beaver', 'rabbit', 'kitten', 'puppy', 'duck',
  'goose', 'eagle', 'robin', 'sparrow', 'parrot', 'owl', 'swan', 'crane', 'heron', 'whale', 'shark', 'dolphin', 'squid',
  'crab', 'shrimp', 'turtle', 'frog', 'lizard', 'snail', 'bee', 'ant', 'moth', 'spider', 'beetle', 'fox', 'wolf', 'bear',
  'deer', 'moose', 'bison', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white',
  'silver', 'gold', 'bronze', 'copper', 'ivory', 'jade', 'ruby', 'violet', 'indigo', 'teal', 'happy', 'brave', 'calm',
  'clever', 'gentle', 'jolly', 'lucky', 'merry', 'proud', 'quick', 'quiet', 'rapid', 'shiny', 'silly', 'sunny', 'swift',
  'tidy', 'witty', 'zesty', 'bold', 'bright', 'cozy', 'crisp', 'fancy', 'fresh', 'fuzzy', 'giant', 'grand', 'humble',
  'kind', 'lively', 'lofty', 'mighty', 'neat', 'noble', 'polite', 'royal', 'sleek', 'smooth', 'snowy', 'sweet', 'tiny',
  'warm', 'wise', 'young', 'eager', 'fair', 'firm', 'golden', 'boat', 'ship', 'train', 'plane', 'bike', 'truck', 'wagon',
  'kite', 'drum', 'flute', 'guitar', 'violin', 'harp', 'bell', 'horn', 'whistle', 'trumpet', 'banjo', 'cello', 'book',
  'pencil', 'paper', 'brush', 'paint', 'chalk', 'crayon', 'marker', 'ruler', 'eraser', 'globe', 'map', 'compass', 'anchor',
  'arrow', 'bridge', 'castle', 'tower', 'temple', 'hat', 'coat', 'scarf', 'glove', 'boot', 'sock', 'shirt', 'dress',
  'jacket', 'button', 'ribbon', 'zipper', 'pocket', 'wallet', 'basket', 'bucket', 'candle', 'lantern', 'ladder', 'jump',
  'run', 'swim', 'fly', 'sing', 'dance', 'laugh', 'smile', 'wave',
] as const;

export function readablePassword(): string {
  if (WORDS.length !== 256) throw new Error('词表要正好 256 个');
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  const words = Array.from(bytes, (b) => WORDS[b]!);
  // 两位数字 00–99：拒绝 200 及以上的字节，免得前几个数字概率偏高
  let n: number;
  do n = crypto.getRandomValues(new Uint8Array(1))[0]!;
  while (n >= 200);
  return `${words.join('-')}-${String(n % 100).padStart(2, '0')}`;
}
