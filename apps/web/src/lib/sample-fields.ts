import { ROLE_FIELDS, type SlideRole } from "@ama/shared";

/** Sample copy per role so a design can be previewed without a post. Point pages cycle through the heads. */
const SAMPLE: Record<SlideRole, Record<string, string>> = {
  cover: { title: "転職で後悔しない3つの準備", sub: "3分でわかる" },
  empathy: { head: "不安だよね", body: "何から始めればいいか分からないのが普通です。" },
  point: { head: "自己分析", body: "得意なことや苦手なことを整理して、次の仕事で大切にしたいことを見つけよう。" },
  pick: { label: "まとめ", head: "迷ったら", body: "まずは転職の軸を決めて、気になる求人を比べてみよう。" },
  cta: { head: "保存して見返そう", cta: "フォローしてね" }
};

const POINT_HEADS = ["自己分析", "軸を決める", "求人を比べる", "面接準備"] as const;

/** `s{page}_{name}` fields for every page of a structure, so a sample can be drawn for any structure. */
export function sampleFieldsFor(structure: readonly SlideRole[]): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  let point = 0;
  structure.forEach((role, index) => {
    const page = index + 1;
    if (role === "point") point += 1;
    for (const { name } of ROLE_FIELDS[role]) {
      const value = role === "point" && name === "num" ? String(point) : role === "point" && name === "head" ? POINT_HEADS[(point - 1) % POINT_HEADS.length]! : SAMPLE[role][name] ?? "";
      fields[`s${page}_${name}`] = value;
    }
  });
  return fields;
}
