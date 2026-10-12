import { defineConfig } from "vitest/config";

// worker/ 는 자체 package.json과 테스트를 가진 별도 패키지라서 여기서는 제외한다.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
