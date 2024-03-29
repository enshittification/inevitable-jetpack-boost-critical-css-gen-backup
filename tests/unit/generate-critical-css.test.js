/* global browser */

const {
	generateCriticalCSS,
	BrowserInterfacePuppeteer,
} = require("../../lib/index.js");
const { dataUrl } = require("../lib/data-directory");
const mockFetch = require("../lib/mock-fetch");
const path = require("path");

const testPageUrls = {
	pageA: path.join(dataUrl, "page-a/index.html"),
};

class MockedFetchInterface extends BrowserInterfacePuppeteer {
	fetch( url, options ) {
		return mockFetch(url, options);
	}
}

let testPages = {};

/**
 * Run a batch of CSS generation test runs, verify the results contain (and do not contain) specific substrings.
 * Verifies no warnings get generated.
 *
 * @param {Object[]} testSets Sets of tests to run, and strings the result should / should not contain.
 */
async function runTestSet(testSets) {
	for (const {
		urls,
		viewports,
		shouldContain,
		shouldNotContain,
		shouldMatch,
	} of testSets) {
		const [css, warnings] = await generateCriticalCSS({
			urls: urls || Object.values(testPageUrls),
			viewports: viewports || [{ width: 640, height: 480 }],
			browserInterface: new MockedFetchInterface(testPages),
		});

		expect(warnings).toHaveLength(0);

		for (const should of shouldContain || []) {
			expect(css).toContain(should);
		}

		for (const shouldNot of shouldNotContain || []) {
			expect(css).not.toContain(shouldNot);
		}

		for (const regexp of shouldMatch || []) {
			expect(css).toMatch(regexp);
		}
	}
}

describe("Generate Critical CSS", () => {
	// Open test pages in tabs ready for tests.
	beforeAll(async () => {
		for (const url of Object.values(testPageUrls)) {
			testPages[url] = await browser.newPage();
			await testPages[url].goto(url);
		}
	});

	// Clean up test pages.
	afterAll(async () => {
		for (const page of Object.values(testPages)) {
			await page.close();
		}
	});

	describe("Inclusions and Exclusions", () => {
		it("Excludes elements below the fold", async () => {
			await runTestSet([
				{
					viewports: [{ width: 640, height: 480 }],
					shouldContain: ["div.top"],
					shouldNotContain: [
						"div.four_eighty",
						"div.six_hundred",
						"div.seven_sixty_eight",
					],
				},

				{
					viewports: [{ width: 800, height: 600 }],
					shouldContain: ["div.top", "div.four_eighty"],
					shouldNotContain: ["div.eight_hundred", "div.seven_sixty_eight"],
				},
			]);
		});

		it("Excludes irrelevant media queries", async () => {
			await runTestSet([
				{
					shouldContain: ["@media screen", "@media all"],
					shouldNotContain: ["@media print", "@media not screen"],
				},
			]);
		});

		it('Excludes Critical CSS from a <link media="print"> tag', async () => {
			await runTestSet([
				{
					shouldNotContain: ["sir_not_appearing_in_this_film"],
				},
			]);
		});

		it("Includes implicit @media rules inherited from <link> tags", async () => {
			await runTestSet([
				{
					shouldMatch: [
						/@media\s+\(\s*min-width:\s*50px\s*\)\s*{\s*@media\s+screen\s*{/,
					],
				},
			]);
		});

		it("Can manage complex implicit @media rules inherited from <link> tags", async () => {
			await runTestSet([
				{
					shouldContain: [
						"@media only screen and (max-device-width:480px) and (orientation:landscape){div.complex_media_rules{",
					],
				},
			]);
		});
	});
});
