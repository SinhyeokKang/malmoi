import { client } from "./.b3-lib";
const prisma = client();
const project = await prisma.project.findUniqueOrThrow({ where: { slug: "order-check" }, select: { id: true } });
const tag = process.argv[2] ?? "C";
for (const key of ["toolbar.selection", "buttons.retry"]) {
  const k = await prisma.stringKey.findFirstOrThrow({ where: { projectId: project.id, key }, select: { id: true } });
  await prisma.translation.update({
    where: { keyId_localeCode: { keyId: k.id, localeCode: "ko" } },
    data: { value: `[${tag}] ${key}`, needsReview: false, updatedBy: "c-stage" },
  });
  console.log(`편집: ko ${key} = [${tag}] ${key}`);
}
await prisma.$disconnect();
