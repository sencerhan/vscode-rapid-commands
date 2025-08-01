# Command Runner

Run local and global commands from VS Code's sidebar.

## Features

- Save frequently used commands
- Global commands available in all projects
- Local commands specific to each project
- Auto-run toggle option
- Last used command moves to top
- Edit and delete commands easily
- Export/Import global commands for backup and sharing
- Command validation and error handling

## Usage

1. Click "+" to add a new command
2. Enter command name and the command to execute
3. Choose if command should be global or local
4. Commands appear in sidebar
5. Click command to run in current terminal
6. Use context menu for more options

### Global Commands Management

- **Export Global Commands**: Right-click in sidebar → "Export Global Commands" to save your global commands as JSON
- **Import Global Commands**: Right-click in sidebar → "Import Global Commands" to restore or merge global commands from JSON file
- Choose between "Replace All" or "Merge" when importing

## Requirements

- VS Code 1.80.0 or higher

## Settings

* `commandRunner.autoRun`: Enable/disable automatic command execution (default: false)

## Release Notes

### 1.0.2
- Added global commands export/import functionality
- Fixed edit command bug (was creating duplicate instead of updating)
- Improved error handling and user feedback
- Enhanced command validation

### 1.0.1
- Bug fixes and stability improvements
- Better file handling

### 1.0.0
- Initial release
- Local and global command support
- Auto-run toggle feature
- Command editing and deletion
- Last used command tracking
