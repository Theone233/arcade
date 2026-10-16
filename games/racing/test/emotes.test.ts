/** 交流的编号表和 kit、短语表对得上（game/emotes.ts）。 */
import { PROPS, STICKERS } from 'arcade-kit/fun';
import { describe, expect, it } from 'vitest';
import { EMOTES, PHRASE_COUNT, PROP_BASE, PROP_COUNT, STICKER_BASE, STICKER_COUNT } from '../src/game/emotes.ts';
import { racingRoom } from '../src/room/rules.ts';
import { PHRASES } from '../src/view/text.ts';

describe('交流编号', () => {
  it('张数对得上', () => {
    expect(PHRASES.length).toBe(PHRASE_COUNT);
    expect(STICKERS.length).toBe(STICKER_COUNT);
    expect(PROPS.length).toBe(PROP_COUNT);
    expect(STICKER_BASE).toBe(PHRASE_COUNT);
    expect(PROP_BASE).toBe(STICKER_BASE + STICKER_COUNT);
    expect(racingRoom.emotes).toBe(EMOTES);
  });
});
