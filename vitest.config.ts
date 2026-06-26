import { defineConfig } from 'vitest/config'

// Committed unit tests for the pure engine/helper logic (no electron, no real
// repo): blame/worktree/submodule parsing, GitFlow branch math, the GitHub URL
// parser, the AI diff-bounding, and the M1 diff parser/patch builder.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
})
