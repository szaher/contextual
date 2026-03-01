import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ctxl',
  description: 'Local-first context memory for AI coding agents',
  base: '/ctxl/',

  head: [
    ['meta', { name: 'theme-color', content: '#3a7bd5' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'ctxl - Context Memory for AI Coding Agents' }],
    ['meta', { name: 'og:description', content: 'Local-first context memory for AI coding agents' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Getting Started', link: '/getting-started/installation' },
      { text: 'Guide', link: '/guide/ctx-format' },
      { text: 'API Reference', link: '/api/cli-reference' },
      { text: 'Examples', link: '/examples/basic-usage' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Quick Start', link: '/getting-started/quick-start' },
          { text: 'Core Concepts', link: '/getting-started/concepts' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: '.ctx File Format', link: '/guide/ctx-format' },
          { text: 'Hierarchical Contexts', link: '/guide/hierarchical-contexts' },
          { text: 'Scoring Algorithm', link: '/guide/scoring-algorithm' },
          { text: 'Budget Management', link: '/guide/budget-management' },
          { text: 'Contracts', link: '/guide/contracts' },
          { text: 'Drift Detection', link: '/guide/drift-detection' },
          { text: 'Proposals', link: '/guide/proposals' },
          { text: 'Sessions', link: '/guide/sessions' },
          { text: 'Profiles', link: '/guide/profiles' },
          { text: 'Security', link: '/guide/security' },
          { text: 'Agent Integration', link: '/guide/agent-integration' },
          { text: 'Dashboard', link: '/guide/dashboard' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'CLI Reference', link: '/api/cli-reference' },
          { text: 'HTTP API', link: '/api/http-api' },
          { text: 'Core Library', link: '/api/core-library' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Basic Usage', link: '/examples/basic-usage' },
          { text: 'Real-World Setup', link: '/examples/real-world' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/szaher/ctxl' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2026-present ctxl contributors',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/szaher/ctxl/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    outline: {
      level: [2, 3],
    },
  },
})
