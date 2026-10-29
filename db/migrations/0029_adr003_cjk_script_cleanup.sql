-- The CJK script-corruption cleanup.
--
-- WHAT THIS REMOVES
--
-- 14 of the 301 Japanese and Chinese translations are MODEL
-- DEGENERATION, not translation. The model lost the thread
-- mid-generation and emitted English, or a half-formed token, inside
-- otherwise-correct Japanese:
--
--   ナシゴレンは.ENGLISH_ID.
--   today's samosas are a staple across India, Pakistan, Bangladesh
--   「Mie bakso」は黄色い麺とライスバーミンブリ Shilat served with
--     yellow noodles and rice vermicelli
--   マ{tabak}テルは、溶き卵、刻みねぎや青ねぎ、す minced 肉を Crete
--     にABLESで焼いたものを
--   gado-gadoはslides、METI diplomacy、narration、in the broader
--     Indonesian sense.
--   グラスゴーで発明されたことから、イギリスの国民料理Frequently
--     considered a British national dish
--
-- None of these is recoverable: the beginning and the end are two
-- different sentences and the middle is debris. The repair is to
-- re-translate them.
--
-- WHY THE EXISTING CHECKS MISSED THEM
--
-- The length ratio was fine — the corruption is verbose, not short.
-- The glued-word check did not fire. The translation looked like
-- Japanese: 27 kana, 4 kanji.
--
-- WHAT IS DELIBERATELY NOT TOUCHED
--
-- The detector is the Python in scripts/find_cjk_debris.py, and it
-- knows the difference between debris and a LEGITIMATE dish name kept
-- in Latin. These are correct and are left alone:
--
--   Babi guling是巴厘岛式烤全猪。
--   Bakso是印度尼西亚的肉丸汤或肉糜汤。
--   Martabak manis 是一种以 apam balik 为基础制成的厚实甜味折叠煎饼
--   经过几个世纪，葡萄牙的 carne de vinha d'alhos 逐渐演变成了 vindaloo。
--   バリ島版の「nasi campur Bali」はこの型に沿って、...
--
-- THE IDS ARE GENERATED, NOT HAND-WRITTEN
--
-- They come from scripts/find_cjk_debris.py, which is also what the
-- translator's output check uses. One detector, one list — so the
-- migration and the validator can never disagree about what debris
-- is.
--
-- The DELETE is idempotent: running it twice deletes nothing the
-- second time.

BEGIN;

DELETE FROM description_sentence_translations
 WHERE id IN ('477abbe8-d19c-47c3-9182-34e42c9f7d36', '72563d85-d5a2-4470-aba7-ddc64f5e1d93', 'e7f5588b-004f-429c-8bb6-885fa780469c', '4192922c-d07a-4053-aba5-c127f3276598', 'cc0df31a-5363-44d1-a991-97be7298b136', 'b4f37c23-38be-43bc-a61c-27aaed2e054f', 'd8844f93-8072-4365-b337-9f11ead02a5d', '6cd853e4-36f5-433f-93cc-6056347155fb', '3ce57e90-3920-4db9-88d1-f6df74c61876', '4f2caeea-fd57-4559-984f-a88fcb1ab061', '85fdd7e7-780e-4676-9254-293bd1c59bd6', '78390224-ba9b-4339-b819-18589c1223b0', '6999600b-d1b8-4b87-bebe-7c72bebdf7ca', '24803efd-45fe-4364-ab94-49c20a518aa9');

COMMIT;
