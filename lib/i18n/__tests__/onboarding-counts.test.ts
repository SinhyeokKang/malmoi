import { expect, it } from "vitest";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";
import { es } from "@/messages/es";

it("#306 후보 언어 수는 각 언어의 단복수 표현을 따른다", () => {
  expect(en.newProject.files.summaryShort(1, "2 keys")).toBe("1 language · 2 keys");
  expect(en.newProject.files.summaryShort(2, "2 keys")).toBe("2 languages · 2 keys");
  expect(es.newProject.files.summaryShort(1, "2 claves")).toBe("1 idioma · 2 claves");
  expect(es.newProject.files.summaryShort(2, "2 claves")).toBe("2 idiomas · 2 claves");
  expect(ko.newProject.files.summaryShort(1, "키 2개")).toBe("언어 1개 · 키 2개");
});
