# Data Structures

This document details the key data structures used in the Package Manager, including their definitions, relationships, and usage patterns.

## Package and Component Types

The Package Manager uses a type system to categorize different kinds of components:

### ComponentType Enumeration

```typescript
/**
 * Supported component types
 */
export type ComponentType = "mode" | "prompt" | "package" | "mcp server"
```

These types represent the different kinds of components that can be managed by the Package Manager:

1. **mode**: AI assistant personalities with specialized capabilities
2. **prompt**: Pre-configured instructions for specific tasks
3. **package**: Collections of related components
4. **mcp server**: Model Context Protocol servers that provide additional functionality

## Core Data Structures

### PackageManagerRepository

```typescript
/**
 * Represents a repository with its metadata and items
 */
export interface PackageManagerRepository {
	metadata: RepositoryMetadata
	items: PackageManagerItem[]
	url: string
	defaultBranch: string
	error?: string
}
```

This interface represents a complete repository:

- **metadata**: The repository metadata
- **items**: Array of items in the repository
- **url**: The URL to the repository
- **defaultBranch**: The default Git branch (e.g., "main")
- **error**: Optional error message if there was a problem

### PackageManagerItem

```typescript
/**
 * Represents an individual package manager item
 */
export interface PackageManagerItem {
	name: string
	description: string
	type: ComponentType
	url: string
	repoUrl: string
	sourceName?: string
	author?: string
	tags?: string[]
	version?: string
	lastUpdated?: string
	sourceUrl?: string
	defaultBranch?: string
	items?: {
		type: ComponentType
		path: string
		metadata?: ComponentMetadata
		lastUpdated?: string
		matchInfo?: MatchInfo
	}[]
	matchInfo?: MatchInfo
}
```

Key changes:

- Added **defaultBranch** field for Git branch tracking
- Enhanced **matchInfo** structure for better filtering
- Improved subcomponent handling

### MatchInfo

```typescript
/**
 * Information about why an item matched search/filter criteria
 */
export interface MatchInfo {
	matched: boolean
	matchReason?: {
		nameMatch?: boolean
		descriptionMatch?: boolean
		typeMatch?: boolean
		tagMatch?: boolean
		hasMatchingSubcomponents?: boolean
	}
}
```

Enhanced match tracking:

- Added **typeMatch** for component type filtering
- More detailed match reasons
- Support for subcomponent matching

## State Management Structures

### ViewState

```typescript
/**
 * View-level state management
 */
interface ViewState {
	items: PackageManagerItem[]
	sortBy: "name" | "lastUpdated"
	sortOrder: "asc" | "desc"
	filters: Filters
}
```

Manages UI state:

- Current items
- Sort configuration
- Filter state

### Filters

```typescript
/**
 * Filter criteria
 */
interface Filters {
	type: string
	search: string
	tags: string[]
}
```

Enhanced filtering:

- Component type filtering
- Text search
- Tag-based filtering

## Metadata Interfaces

### BaseMetadata

```typescript
/**
 * Base metadata interface
 */
export interface BaseMetadata {
	name: string
	description: string
	version: string
	tags?: string[]
}
```

Common metadata properties:

- **name**: Display name
- **description**: Detailed explanation
- **version**: Semantic version
- **tags**: Optional keywords

### ComponentMetadata

```typescript
/**
 * Component metadata with type
 */
export interface ComponentMetadata extends BaseMetadata {
	type: ComponentType
	lastUpdated?: string
}
```

Added:

- **lastUpdated** field for tracking changes

### PackageMetadata

```typescript
/**
 * Package metadata with subcomponents
 */
export interface PackageMetadata extends ComponentMetadata {
	type: "package"
	items?: {
		type: ComponentType
		path: string
		metadata?: ComponentMetadata
		lastUpdated?: string
	}[]
}
```

Enhanced with:

- Subcomponent tracking
- Last update timestamps

## Source Management

### PackageManagerSource

```typescript
/**
 * Git repository source
 */
export interface PackageManagerSource {
	url: string
	name?: string
	enabled: boolean
}
```

Repository source configuration:

- **url**: Git repository URL
- **name**: Optional display name
- **enabled**: Source status

### SourceOperation

```typescript
/**
 * Source operation tracking
 */
interface SourceOperation {
	url: string
	type: "clone" | "pull" | "refresh"
	timestamp: number
}
```

Tracks repository operations:

- Operation type
- Timestamp
- Source URL

## Cache Management

### CacheEntry

```typescript
/**
 * Cache entry structure
 */
interface CacheEntry<T> {
	data: T
	timestamp: number
}
```

Generic cache structure:

- Cached data
- Timestamp for expiry

### RepositoryCache

```typescript
/**
 * Repository cache management
 */
type RepositoryCache = Map<string, CacheEntry<PackageManagerRepository>>
```

Specialized for repositories:

- URL-based lookup
- Timestamp-based expiry
- Full repository data

## Message Structures

### Input Messages

```typescript
type PackageManagerMessage =
	| { type: "getItems" }
	| {
			type: "search"
			search: string
			typeFilter: string
			tagFilters: string[]
	  }
	| {
			type: "addSource"
			url: string
			name?: string
	  }
	| {
			type: "removeSource"
			url: string
	  }
	| { type: "refreshSources" }
```

### Output Messages

```typescript
type PackageManagerResponse =
	| {
			type: "items"
			data: PackageManagerItem[]
	  }
	| {
			type: "searchResults"
			data: PackageManagerItem[]
			filters: Filters
	  }
	| {
			type: "sourceAdded" | "sourceRemoved"
			data: { success: boolean }
	  }
	| {
			type: "error"
			error: string
	  }
```

Enhanced with:

- Filter state in search results
- Operation success tracking
- Detailed error reporting

## Data Validation

### Metadata Validation

```typescript
/**
 * Validate component metadata
 */
function validateMetadata(metadata: unknown): metadata is ComponentMetadata {
	if (!isObject(metadata)) return false

	return (
		typeof metadata.name === "string" &&
		typeof metadata.description === "string" &&
		typeof metadata.version === "string" &&
		(metadata.tags === undefined || Array.isArray(metadata.tags)) &&
		isValidComponentType(metadata.type)
	)
}
```

### URL Validation

```typescript
/**
 * Validate Git repository URL
 */
function isValidGitUrl(url: string): boolean {
	if (!url) return false

	// Support common Git URL formats
	return /^(https?:\/\/|git@)/.test(url) && /\.git$/.test(url)
}
```

## Data Flow

The Package Manager transforms data through several stages:

1. **Repository Level**:

    - Clone/pull Git repositories
    - Parse metadata files
    - Build component hierarchy

2. **Cache Level**:

    - Store repository data
    - Track timestamps
    - Handle expiration

3. **View Level**:
    - Apply filters
    - Sort items
    - Track matches
    - Manage UI state

## Data Relationships

### Component Hierarchy

```
Repository
├── Metadata
└── Items
    ├── Package
    │   ├── Mode
    │   ├── MCP Server
    │   └── Prompt
    └── Standalone Components
```

### State Flow

```
Git Repository → Cache → PackageManager → ViewState → UI
```

### Filter Chain

```
Raw Items → Type Filter → Search Filter → Tag Filter → Sorted Results
```

---

**Previous**: [Core Components](./02-core-components.md) | **Next**: [Search and Filter Implementation](./04-search-and-filter.md)
