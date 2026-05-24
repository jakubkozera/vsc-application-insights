# Azure App Insights Explorer for VS Code

Browse Azure Application Insights and Log Analytics data directly from Visual Studio Code. The extension adds a dedicated App Insights view to the activity bar so you can manage connections, run KQL queries, inspect log tables, and investigate failures without switching to the Azure portal.

## Features

### Connection Management
Add and manage Application Insights connections using Microsoft Entra ID or an API key. Keep multiple connections in the explorer and switch the active one when needed.

### KQL Querying
Open a query editor, write Kusto Query Language queries, and run them against the active connection. Save useful queries and run them again from the Saved Queries view.

### Log Table Browsing
Browse available log tables and inspect query results in a dedicated table view. Filter columns, search values, and work with result sets directly inside VS Code.

### Failures Investigation
Open a focused failures view to inspect exceptions and failed operations in a more efficient workflow than the Azure portal.

## Getting Started

1. Install the extension.
2. Open the App Insights Explorer view from the activity bar.
3. Select Add Connection.
4. Authenticate with Microsoft Entra ID or provide an API key.
5. Open Search or Browse Table to start exploring telemetry.

## Requirements

- An Azure Application Insights resource or Log Analytics workspace with query access.
- Valid Azure credentials or an API key.

## Development

### Prerequisites

- Node.js 20 or later
- VS Code

### Build

```sh
npm ci
npm ci --prefix webviews
npm run build:all
```

### Test

```sh
npm test
```

## License

MIT
