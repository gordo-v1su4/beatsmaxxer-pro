// Run against a dev/preview server: bun run verify:mobile-startup
// Requires Chrome with WebGPU; BASE_URL may point at a deployed release.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  for (const scenario of ['normal', 'stalled-splash', 'no-webgpu']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36'
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(scenario => {
      if (scenario === 'no-webgpu') {
        Object.defineProperty(navigator, 'gpu', { value: undefined });
      } else if (scenario === 'stalled-splash') {
        const splashModules = new WeakSet();
        const createModule = GPUDevice.prototype.createShaderModule;
        const createPipeline = GPUDevice.prototype.createRenderPipelineAsync;
        GPUDevice.prototype.createShaderModule = function (descriptor) {
          const module = createModule.call(this, descriptor);
          if (descriptor.code.includes('softened * coverage')) splashModules.add(module);
          return module;
        };
        GPUDevice.prototype.createRenderPipelineAsync = function (descriptor) {
          if (splashModules.has(descriptor.fragment?.module)) return new Promise(() => {});
          return createPipeline.call(this, descriptor);
        };
      }
    }, scenario);
    const url = new URL(process.env.BASE_URL || 'http://localhost:5174');
    // Exercise automatic phone detection, not the ?mobile override.
    url.searchParams.set('splash', 'hold');
    await page.goto(url.href);
    if (scenario !== 'no-webgpu') {
      await page.waitForFunction(() => document.querySelector('.graphic.painted img')?.naturalWidth > 0,
        null, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelector('.splash')?.textContent.includes('Workspace ready'),
        null, { timeout: 65000 });
      assert.equal(await page.locator('.graphic canvas').count(), 0, 'phone splash must not own a GPU canvas');
      assert.equal(await page.locator('canvas').count(), 1, 'only the performance stage owns a canvas');
    } else {
      await page.waitForFunction(() => !document.querySelector('.splash') && document.querySelector('.mobile-shell'),
        null, { timeout: 15000 });
    }
    assert.deepEqual(errors, [], 'startup must not throw');
    console.log(`PASS mobile startup: ${scenario}`);
    await context.close();
  }
} finally { await browser.close(); }
