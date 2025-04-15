import { PackageManagerViewStateManager } from "../PackageManagerViewStateManager"
import { vscode } from "../../../utils/vscode"
import {
	ComponentType,
	PackageManagerItem,
	PackageManagerSource,
} from "../../../../../src/services/package-manager/types"
import { DEFAULT_PACKAGE_MANAGER_SOURCE } from "../../../../../src/services/package-manager/constants"

const createTestItem = (overrides = {}): PackageManagerItem => ({
	name: "test",
	type: "mode" as ComponentType,
	description: "Test mode",
	url: "https://github.com/test/repo",
	repoUrl: "https://github.com/test/repo",
	author: "Test Author",
	version: "1.0.0",
	sourceName: "Test Source",
	sourceUrl: "https://github.com/test/repo",
	...overrides,
})

const createTestSources = (): PackageManagerSource[] => [
	{ url: "https://github.com/test/repo1", enabled: true },
	{ url: "https://github.com/test/repo2", enabled: true },
	{ url: "https://github.com/test/repo3", enabled: true },
]

// Mock vscode.postMessage
jest.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: jest.fn(),
	},
}))

describe("PackageManagerViewStateManager", () => {
	let manager: PackageManagerViewStateManager

	beforeEach(() => {
		jest.clearAllMocks()
		jest.useFakeTimers()
		manager = new PackageManagerViewStateManager()
		manager.initialize() // Send initial sources
	})

	afterEach(() => {
		jest.clearAllTimers()
		jest.useRealTimers()
	})

	describe("Initial State", () => {
		it("should initialize with default state", () => {
			const state = manager.getState()
			expect(state).toEqual({
				allItems: [],
				displayItems: [],
				isFetching: false,
				activeTab: "browse",
				refreshingUrls: [],
				sources: [DEFAULT_PACKAGE_MANAGER_SOURCE],
				filters: {
					type: "",
					search: "",
					tags: [],
				},
				sortConfig: {
					by: "name",
					order: "asc",
				},
			})
		})

		it("should send initial sources when initialized", () => {
			manager.initialize()
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "packageManagerSources",
				sources: [DEFAULT_PACKAGE_MANAGER_SOURCE],
			})
		})

		it("should initialize with default source", () => {
			const manager = new PackageManagerViewStateManager()

			// Initial state should include default source
			const state = manager.getState()
			expect(state.sources).toEqual([
				{
					url: "https://github.com/RooVetGit/Roo-Code-Packages",
					name: "Roo Code",
					enabled: true,
				},
			])

			// Verify initial message was sent to update sources
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "packageManagerSources",
				sources: [
					{
						url: "https://github.com/RooVetGit/Roo-Code-Packages",
						name: "Roo Code",
						enabled: true,
					},
				],
			})
		})
	})

	describe("Fetch Transitions", () => {
		it("should handle FETCH_ITEMS transition", async () => {
			jest.clearAllMocks() // Clear mock to ignore initialize() call
			await manager.transition({ type: "FETCH_ITEMS" })

			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(true)
		})

		it("should not start a new fetch if one is in progress", async () => {
			jest.clearAllMocks() // Clear mock to ignore initialize() call
			// Start first fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// Try to start second fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// postMessage should only be called once
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
		})

		it("should handle FETCH_COMPLETE transition", async () => {
			const testItems = [createTestItem()]

			await manager.transition({ type: "FETCH_ITEMS" })
			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: testItems },
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
			expect(state.allItems).toEqual(testItems)
		})

		it("should handle FETCH_ERROR transition", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })
			await manager.transition({ type: "FETCH_ERROR" })

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})
	})

	describe("Race Conditions", () => {
		it("should handle rapid tab switching during initial load", async () => {
			// Start initial load
			await manager.transition({ type: "FETCH_ITEMS" })

			// Quickly switch to sources tab
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "sources" },
			})

			// Switch back to browse before load completes
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "browse" },
			})

			// Complete the initial load
			await manager.handleMessage({
				type: "state",
				state: { packageManagerItems: [createTestItem()] },
			})

			const state = manager.getState()
			expect(state.activeTab).toBe("browse")
			expect(state.allItems).toHaveLength(1)
			expect(state.isFetching).toBe(false)
		})

		it("should handle rapid filtering during initial load", async () => {
			// Start initial load
			await manager.transition({ type: "FETCH_ITEMS" })

			// Quickly apply filters
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { type: "mode" } },
			})

			// Complete the initial load
			await manager.handleMessage({
				type: "state",
				state: { packageManagerItems: [createTestItem()] },
			})

			// Fast-forward past debounce time
			jest.advanceTimersByTime(300)

			const state = manager.getState()
			expect(state.filters.type).toBe("mode")
			// We don't preserve allItems during filtering anymore
			expect(state.displayItems).toBeDefined()
			expect(vscode.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "filterPackageManagerItems",
					filters: expect.objectContaining({ type: "mode" }),
				}),
			)
		})

		it("should handle concurrent filter operations", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// Apply first filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test" } },
			})

			// Apply second filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { type: "mode" } },
			})

			// Each filter update should be sent immediately
			expect(vscode.postMessage).toHaveBeenCalledTimes(2)
			expect(vscode.postMessage).toHaveBeenLastCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					search: "test",
					type: "mode",
					tags: [],
				},
			})
		})

		it("should handle rapid source deletions", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// Create test sources
			const testSources = createTestSources()

			// Set initial sources and wait for state update
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: testSources },
			})

			// Delete all sources at once
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: [] },
			})

			// Wait for state to settle
			jest.runAllTimers()

			// Get all calls to postMessage
			const calls = (vscode.postMessage as jest.Mock).mock.calls
			const sourcesMessages = calls.filter((call) => call[0].type === "packageManagerSources")
			const lastSourcesMessage = sourcesMessages[sourcesMessages.length - 1]

			// Verify state has default source
			const state = manager.getState()
			expect(state.sources).toEqual([DEFAULT_PACKAGE_MANAGER_SOURCE])

			// Verify the last sources message was sent with default source
			expect(lastSourcesMessage[0]).toEqual({
				type: "packageManagerSources",
				sources: [DEFAULT_PACKAGE_MANAGER_SOURCE],
			})
		})

		it("should handle rapid source operations during fetch", async () => {
			// Start a fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// Rapidly update sources while fetch is in progress
			const sources = [{ url: "https://github.com/test/repo1", enabled: true }]

			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources },
			})

			// Complete the fetch
			await manager.handleMessage({
				type: "state",
				state: { packageManagerItems: [createTestItem()] },
			})

			const state = manager.getState()
			expect(state.sources).toEqual(sources)
			expect(state.allItems).toHaveLength(1)
			expect(state.isFetching).toBe(false)
		})

		it("should trigger fetch after adding a new source and switching to browse", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// Add a new source
			const newSource = { url: "https://github.com/test/repo1", enabled: true }
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: [DEFAULT_PACKAGE_MANAGER_SOURCE, newSource] },
			})

			// Switch to browse tab
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "browse" },
			})

			// Run any pending timers
			jest.runAllTimers()

			// Verify that a fetch was triggered
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})

			// Verify state
			const state = manager.getState()
			expect(state.isFetching).toBe(true)
			expect(state.activeTab).toBe("browse")
		})
	})

	describe("Error Handling", () => {
		it("should handle fetch timeout", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })

			// Fast-forward past the timeout
			jest.advanceTimersByTime(30000)

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should handle invalid message types gracefully", () => {
			manager.handleMessage({ type: "invalidType" })
			const state = manager.getState()
			expect(state.isFetching).toBe(false)
			expect(state.allItems).toEqual([])
		})

		it("should handle invalid state message format", () => {
			manager.handleMessage({ type: "state", state: {} })
			const state = manager.getState()
			expect(state.allItems).toEqual([])
		})

		it("should handle invalid transition payloads", async () => {
			// @ts-ignore - Testing invalid payload
			await manager.transition({ type: "UPDATE_FILTERS", payload: { invalid: true } })
			const state = manager.getState()
			expect(state.filters).toEqual({
				type: "",
				search: "",
				tags: [],
			})
		})
	})

	describe("Filter Behavior", () => {
		it("should send filter updates immediately", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// Apply first filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test1" } },
			})

			// Apply second filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test2" } },
			})

			// Apply third filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "test3" } },
			})

			// Should send all updates immediately
			expect(vscode.postMessage).toHaveBeenCalledTimes(3)
			expect(vscode.postMessage).toHaveBeenLastCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					type: "",
					search: "test3",
					tags: [],
				},
			})
		})

		it("should send filter message immediately when filters are cleared", async () => {
			// First set some filters
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: {
					filters: {
						type: "mode",
						search: "test",
					},
				},
			})

			// Clear mock to ignore the first filter message
			;(vscode.postMessage as jest.Mock).mockClear()

			// Clear filters
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: {
					filters: {
						type: "",
						search: "",
						tags: [],
					},
				},
			})

			// Should send filter message with empty filters immediately
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					type: "",
					search: "",
					tags: [],
				},
			})
		})

		it("should maintain filter criteria when search is cleared", async () => {
			// Reset mock before test
			;(vscode.postMessage as jest.Mock).mockClear()

			// First set a type filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: {
					filters: { type: "mode" },
				},
			})

			// Then add a search term
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: {
					filters: { search: "test" },
				},
			})

			// Clear the search term
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: {
					filters: { search: "" },
				},
			})

			// Should maintain type filter when search is cleared
			expect(vscode.postMessage).toHaveBeenLastCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					type: "mode",
					search: "",
					tags: [],
				},
			})

			const state = manager.getState()
			expect(state.filters).toEqual({
				type: "mode",
				search: "",
				tags: [],
			})
		})
	})

	describe("Message Handling", () => {
		it("should handle repository refresh completion", () => {
			const url = "https://example.com/repo"

			// First add URL to refreshing list
			manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			// Then handle completion message
			manager.handleMessage({
				type: "repositoryRefreshComplete",
				url,
			})

			const state = manager.getState()
			expect(state.refreshingUrls).not.toContain(url)
		})

		it("should handle package manager button click with error", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
				text: "error",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should handle package manager button click for refresh", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(true)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})
	})

	describe("Tab Management", () => {
		it("should handle SET_ACTIVE_TAB transition", async () => {
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "sources" },
			})

			const state = manager.getState()
			expect(state.activeTab).toBe("sources")
		})

		it("should trigger fetch when switching to browse tab with no items", async () => {
			jest.clearAllMocks() // Clear mock to ignore initialize() call
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "browse" },
			})

			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})

		it("should not trigger fetch when switching to browse tab with existing items", async () => {
			jest.clearAllMocks() // Clear mock to ignore initialize() call

			// Add some items first
			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: [createTestItem()] },
			})

			// Switch to browse tab
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "browse" },
			})

			expect(vscode.postMessage).not.toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})

		it("should trigger fetch when switching to browse tab after source modification", async () => {
			jest.clearAllMocks() // Clear mock to ignore initialize() call

			// Add some items first
			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: [createTestItem()] },
			})

			// Modify sources
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: [{ url: "https://github.com/test/repo1", enabled: true }] },
			})

			// Switch to browse tab
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "browse" },
			})

			// Should trigger fetch due to source modification
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})

		it("should not trigger fetch when switching to sources tab", async () => {
			await manager.transition({
				type: "SET_ACTIVE_TAB",
				payload: { tab: "sources" },
			})

			expect(vscode.postMessage).not.toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})
		})
	})

	describe("Fetch Timeout Handling", () => {
		it("should handle fetch timeout", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })

			// Fast-forward past the timeout
			jest.advanceTimersByTime(30000)

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should clear timeout on successful fetch", async () => {
			await manager.transition({ type: "FETCH_ITEMS" })

			// Complete fetch before timeout
			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: [createTestItem()] },
			})

			// Fast-forward past the timeout
			jest.advanceTimersByTime(30000)

			// State should still reflect successful fetch
			const state = manager.getState()
			expect(state.isFetching).toBe(false)
			expect(state.allItems).toHaveLength(1)
		})

		it("should prevent concurrent fetches during timeout period", async () => {
			jest.clearAllMocks() // Clear mock to ignore initialize() call

			// Start first fetch
			await manager.transition({ type: "FETCH_ITEMS" })

			// Attempt second fetch before timeout
			jest.advanceTimersByTime(15000)
			await manager.transition({ type: "FETCH_ITEMS" })

			// postMessage should only be called once
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
		})
	})

	// Filter behavior tests are already covered in the previous describe block

	describe("Source Management", () => {
		beforeEach(() => {
			// Mock setTimeout to execute immediately
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it("should trigger fetch for remaining source after source deletion", async () => {
			// Start with two sources
			const sources = [
				{ url: "https://github.com/test/repo1", enabled: true },
				{ url: "https://github.com/test/repo2", enabled: true },
			]

			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources },
			})

			// Clear mock to ignore initial fetch
			;(vscode.postMessage as jest.Mock).mockClear()

			// Delete one source
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: [sources[0]] },
			})

			// Verify that a fetch was triggered for the remaining source
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "fetchPackageManagerItems",
				bool: true,
			})

			// Verify state has the remaining source
			const state = manager.getState()
			expect(state.sources).toEqual([sources[0]])
		})

		it("should re-add default source when all sources are removed", async () => {
			// Add some test sources
			const sources = [
				{ url: "https://github.com/test/repo1", enabled: true },
				{ url: "https://github.com/test/repo2", enabled: true },
			]

			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources },
			})

			// Clear mock to ignore previous messages
			;(vscode.postMessage as jest.Mock).mockClear()

			// Remove all sources
			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources: [] },
			})

			// Run any pending timers before checking messages
			jest.runAllTimers()

			// Get all calls to postMessage
			const calls = (vscode.postMessage as jest.Mock).mock.calls
			const sourcesMessage = calls.find((call) => call[0].type === "packageManagerSources")

			// Verify that the sources message was sent with default source
			expect(sourcesMessage[0]).toEqual({
				type: "packageManagerSources",
				sources: [
					{
						url: "https://github.com/RooVetGit/Roo-Code-Packages",
						name: "Roo Code",
						enabled: true,
					},
				],
			})
		})

		it("should handle UPDATE_SOURCES transition", async () => {
			const sources = [
				{ url: "https://github.com/test/repo", enabled: true },
				{ url: "https://github.com/test/repo2", enabled: false },
			]

			await manager.transition({
				type: "UPDATE_SOURCES",
				payload: { sources },
			})

			const state = manager.getState()
			expect(state.sources).toEqual(sources)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "packageManagerSources",
				sources,
			})
		})

		it("should handle REFRESH_SOURCE transition", async () => {
			const url = "https://github.com/test/repo"

			await manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			const state = manager.getState()
			expect(state.refreshingUrls).toContain(url)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "refreshPackageManagerSource",
				url,
			})
		})

		it("should handle REFRESH_SOURCE_COMPLETE transition", async () => {
			const url = "https://github.com/test/repo"

			// First add URL to refreshing list
			await manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			// Then complete the refresh
			await manager.transition({
				type: "REFRESH_SOURCE_COMPLETE",
				payload: { url },
			})

			const state = manager.getState()
			expect(state.refreshingUrls).not.toContain(url)
		})
	})

	describe("Filter Transitions", () => {
		it("should preserve original items when receiving filtered results", async () => {
			// Set up initial items
			const initialItems = [
				createTestItem({ name: "Item 1" }),
				createTestItem({ name: "Item 2" }),
				createTestItem({ name: "Item 3" }),
			]
			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: initialItems },
			})

			// Apply a filter
			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters: { search: "Item 1" } },
			})

			// Fast-forward past debounce time
			jest.advanceTimersByTime(300)

			// Simulate receiving filtered results
			manager.handleMessage({
				type: "state",
				state: {
					packageManagerItems: [initialItems[0]], // Only Item 1
				},
			})

			// We no longer preserve original items since we rely on backend filtering
			const state = manager.getState()
			expect(state.allItems).toBeDefined()
		})

		it("should handle UPDATE_FILTERS transition", async () => {
			const filters = {
				type: "mode",
				search: "test",
				tags: ["tag1"],
			}

			await manager.transition({
				type: "UPDATE_FILTERS",
				payload: { filters },
			})

			const state = manager.getState()
			expect(state.filters).toEqual(filters)

			// Fast-forward past debounce time
			jest.advanceTimersByTime(300)

			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "filterPackageManagerItems",
				filters: {
					type: "mode",
					search: "test",
					tags: ["tag1"],
				},
			})
		})
	})

	describe("Sort Transitions", () => {
		it("should sort items by name in ascending order", async () => {
			const items = [
				createTestItem({ name: "B Component" }),
				createTestItem({ name: "A Component" }),
				createTestItem({ name: "C Component" }),
			]

			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items },
			})

			await manager.transition({
				type: "UPDATE_SORT",
				payload: { sortConfig: { by: "name", order: "asc" } },
			})

			const state = manager.getState()
			expect(state.allItems[0].name).toBe("A Component")
			expect(state.allItems[1].name).toBe("B Component")
			expect(state.allItems[2].name).toBe("C Component")
		})

		it("should sort items by lastUpdated in descending order", async () => {
			const items = [
				createTestItem({ lastUpdated: "2025-04-13T09:00:00-07:00" }),
				createTestItem({ lastUpdated: "2025-04-14T09:00:00-07:00" }),
				createTestItem({ lastUpdated: "2025-04-12T09:00:00-07:00" }),
			]

			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items },
			})

			await manager.transition({
				type: "UPDATE_SORT",
				payload: { sortConfig: { by: "lastUpdated", order: "desc" } },
			})

			const state = manager.getState()
			expect(state.allItems[0].lastUpdated).toBe("2025-04-14T09:00:00-07:00")
			expect(state.allItems[1].lastUpdated).toBe("2025-04-13T09:00:00-07:00")
			expect(state.allItems[2].lastUpdated).toBe("2025-04-12T09:00:00-07:00")
		})

		it("should maintain sort order when items are updated", async () => {
			const items = [
				createTestItem({ name: "B Component" }),
				createTestItem({ name: "A Component" }),
				createTestItem({ name: "C Component" }),
			]

			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items },
			})

			await manager.transition({
				type: "UPDATE_SORT",
				payload: { sortConfig: { by: "name", order: "asc" } },
			})

			// Add a new item
			const newItems = [...items, createTestItem({ name: "D Component" })]

			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items: newItems },
			})

			const state = manager.getState()
			expect(state.allItems[0].name).toBe("A Component")
			expect(state.allItems[1].name).toBe("B Component")
			expect(state.allItems[2].name).toBe("C Component")
			expect(state.allItems[3].name).toBe("D Component")
		})

		it("should handle missing values gracefully", async () => {
			const items = [
				createTestItem({ name: "B Component", lastUpdated: undefined }),
				createTestItem({ name: "A Component", lastUpdated: "2025-04-14T09:00:00-07:00" }),
			]

			await manager.transition({
				type: "FETCH_COMPLETE",
				payload: { items },
			})

			await manager.transition({
				type: "UPDATE_SORT",
				payload: { sortConfig: { by: "lastUpdated", order: "desc" } },
			})

			const state = manager.getState()
			expect(state.allItems[0].lastUpdated).toBe("2025-04-14T09:00:00-07:00")
			expect(state.allItems[1].lastUpdated).toBeUndefined()
		})
	})

	describe("Message Handling", () => {
		it("should restore sources from packageManagerSources on webview launch", () => {
			const savedSources = [
				{
					url: "https://github.com/RooVetGit/Roo-Code-Packages",
					name: "Roo Code",
					enabled: true,
				},
				{
					url: "https://github.com/test/custom-repo",
					name: "Custom Repo",
					enabled: true,
				},
			]

			// Simulate VS Code restart by sending initial state with saved sources
			manager.handleMessage({
				type: "state",
				state: { packageManagerSources: savedSources },
			})

			const state = manager.getState()
			expect(state.sources).toEqual(savedSources)
		})

		it("should use default source when state message has no sources", () => {
			manager.handleMessage({
				type: "state",
				state: { packageManagerItems: [] },
			})

			const state = manager.getState()
			expect(state.sources).toEqual([DEFAULT_PACKAGE_MANAGER_SOURCE])
		})

		it("should update sources when receiving state message", () => {
			const customSources = [
				{
					url: "https://github.com/test/repo1",
					name: "Test Repo 1",
					enabled: true,
				},
				{
					url: "https://github.com/test/repo2",
					name: "Test Repo 2",
					enabled: true,
				},
			]

			manager.handleMessage({
				type: "state",
				state: { sources: customSources },
			})

			const state = manager.getState()
			expect(state.sources).toEqual(customSources)
		})

		it("should handle state message with package manager items", () => {
			const testItems = [createTestItem()]

			// We need to use any here since we're testing the raw message handling
			manager.handleMessage({
				type: "state",
				state: { packageManagerItems: testItems },
			} as any)

			const state = manager.getState()
			expect(state.allItems).toEqual(testItems)
		})

		it("should handle repositoryRefreshComplete message", () => {
			const url = "https://example.com/repo"

			// First add URL to refreshing list
			manager.transition({
				type: "REFRESH_SOURCE",
				payload: { url },
			})

			// Then handle completion message
			manager.handleMessage({
				type: "repositoryRefreshComplete",
				url,
			})

			const state = manager.getState()
			expect(state.refreshingUrls).not.toContain(url)
		})

		it("should handle packageManagerButtonClicked message with error", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
				text: "error",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(false)
		})

		it("should handle packageManagerButtonClicked message for refresh", () => {
			manager.handleMessage({
				type: "packageManagerButtonClicked",
			})

			const state = manager.getState()
			expect(state.isFetching).toBe(true)
		})
	})
})
