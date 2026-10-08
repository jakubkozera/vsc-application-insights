# Azure App Insights Explorer for VS Code

Browse Azure Application Insights and Log Analytics data directly from Visual Studio Code. The extension adds a dedicated App Insights view to the activity bar so you can manage connections, run KQL queries, inspect log tables, and investigate failures without switching to the Azure portal.

## Features

### Connection Management
Add and manage Application Insights connections using Microsoft Entra ID or an API key. Keep multiple connections in the explorer and switch the active one when needed.

### KQL Querying
Open a query editor, write Kusto Query Language queries, and run them against the active connection. Save useful queries and run them again from the Saved Queries view.

![Search View](https://raw.githubusercontent.com/jakubkozera/vsc-application-insights/master/docs/search.jpg)

### Log Table Browsing
Browse available log tables and inspect query results in a dedicated table view. Filter columns, search values, and work with result sets directly inside VS Code.

### Copilot Analysis
Click **Analyze** next to **Export** to send the current table rows to GitHub Copilot Chat in Agent mode. A CSV is saved silently in a unique system temporary directory and attached to the chat. Events are ordered oldest first using `timestamp` or `TimeGenerated`; the prompt asks Copilot to reconstruct the flow, highlight errors and summarize key findings and next steps.

This requires a VS Code Stable or Insiders version with Copilot Chat and Agent mode available. Analysis includes all fields present in the selected rows, including hidden columns, and shares this telemetry with Copilot under your configured policies. Temporary CSV files remain available for the chat and are not deleted automatically by the extension.

In an Agent chat, use `#analyze_logs` with a search phrase, for example: `#analyze_logs Analyze the flow for operation a01b9d8a-6eb5-41d3-8220-932b17e0b215 and highlight errors`. The tool opens Search, fills the phrase, runs the query, exports matching rows to a temporary CSV, and returns the data for analysis in the same conversation. If multiple connections exist, you choose one from a list with the active connection highlighted. Search uses your last selected time range (6 hours by default) and returns up to the latest 100 matches. The tool requires a VS Code version supporting the Language Model Tools API; older versions retain the existing explorer commands.

### Failures Investigation
Open a focused failures view to inspect exceptions and failed operations in a more efficient workflow than the Azure portal.

![Failures View](https://raw.githubusercontent.com/jakubkozera/vsc-application-insights/master/docs/failures.jpg)

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
