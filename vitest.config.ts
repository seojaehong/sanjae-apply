import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // 글꼴 전체 임베딩(2MB) 때문에 채우기 시험이 5초를 넘긴다(실측 5.1초)
    testTimeout: 30000,
  },
});
