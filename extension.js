const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Yardımcı fonksiyonlar
const fileUtils = {
    readJsonFile(filePath, defaultValue = { commands: [] }) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        } catch (err) {
            return defaultValue;
        }
    },

    writeJsonFile(filePath, data) {
        try {
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (err) {
            console.error('Error writing file:', err);
            vscode.window.showErrorMessage(`Failed to save command: ${err.message}`);
            return false;
        }
    },

    getLocalPath() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }
        return path.join(workspaceFolders[0].uri.fsPath, 'commands.json');
    },

    ensureLocalFile(filePath) {
        if (!fs.existsSync(filePath)) {
            this.writeJsonFile(filePath, { commands: [] });
        }
    }
};

class CommandFormPanel {
    static currentPanel = undefined;

    constructor(context, editCommand = null) {
        this.panel = vscode.window.createWebviewPanel(
            'commandForm',
            editCommand ? 'Edit Command' : 'Add New Command',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        this.context = context;
        this.editCommand = editCommand;

        this.panel.webview.html = this.getWebviewContent();
        this.panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'saveCommand':
                    this.saveCommand(message.commandData);
                    return;
                case 'ready':
                    if (this.editCommand) {
                        this.panel.webview.postMessage({ 
                            command: 'setInitialData', 
                            data: this.editCommand 
                        });
                    }
                    return;
            }
        });

        this.panel.onDidDispose(() => {
            CommandFormPanel.currentPanel = undefined;
        });
    }

    saveCommand(data) {
        console.log('SaveCommand called with:', data);
        console.log('EditCommand:', this.editCommand);
        
        const { name, command, global } = data;

        if (global) {
            const globalCommands = this.context.globalState.get('globalCommands', []);
            
            if (this.editCommand && this.editCommand.global) {
                // Edit modunda - eski komutu bul ve güncelle
                console.log('Editing global command');
                const index = globalCommands.findIndex(cmd => cmd.name === this.editCommand.name);
                if (index !== -1) {
                    globalCommands[index] = { name, command, global: true };
                } else {
                    globalCommands.unshift({ name, command, global: true });
                }
            } else {
                // Yeni komut ekleme
                console.log('Adding new global command');
                globalCommands.unshift({ name, command, global: true });
            }
            
            this.context.globalState.update('globalCommands', globalCommands);
        } else {
            const localPath = fileUtils.getLocalPath();
            if (!localPath) {
                vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
                return;
            }

            fileUtils.ensureLocalFile(localPath);
            const localCommands = fileUtils.readJsonFile(localPath);
            
            if (this.editCommand && !this.editCommand.global) {
                // Edit modunda - eski komutu bul ve güncelle
                console.log('Editing local command');
                const index = localCommands.commands.findIndex(cmd => cmd.name === this.editCommand.name);
                if (index !== -1) {
                    localCommands.commands[index] = { name, command, global: false };
                } else {
                    localCommands.commands.unshift({ name, command, global: false });
                }
            } else {
                // Yeni komut ekleme
                console.log('Adding new local command');
                localCommands.commands.unshift({ name, command, global: false });
            }
            
            if (!fileUtils.writeJsonFile(localPath, localCommands)) {
                return; // Hata mesajı writeJsonFile içinde gösterilecek
            }
        }

        this.panel.dispose();
        vscode.commands.executeCommand('command-runner.refresh');
        const action = this.editCommand ? 'updated' : 'saved';
        vscode.window.showInformationMessage(`Command "${name}" ${action} successfully`);
    }

    getWebviewContent() {
        return `<!DOCTYPE html>
        <html>
            <head>
                <style>
                    body { padding: 10px; }
                    .form-group { margin-bottom: 15px; }
                    label { display: block; margin-bottom: 5px; }
                    input[type="text"] { width: 100%; padding: 5px; }
                    button { padding: 8px 15px; }
                </style>
            </head>
            <body>
                <div class="form-group">
                    <label>Command Name:</label>
                    <input type="text" id="commandName">
                </div>
                <div class="form-group">
                    <label>Command:</label>
                    <input type="text" id="command">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="isGlobal">
                        Global Command (available in all projects)
                    </label>
                </div>
                <button onclick="saveCommand()">Save Command</button>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'setInitialData') {
                            document.getElementById('commandName').value = message.data.name;
                            document.getElementById('command').value = message.data.command;
                            document.getElementById('isGlobal').checked = message.data.global;
                        }
                    });

                    // Formu yükledikten sonra ready mesajı gönder
                    vscode.postMessage({ command: 'ready' });

                    function saveCommand() {
                        const name = document.getElementById('commandName').value;
                        const command = document.getElementById('command').value;
                        const isGlobal = document.getElementById('isGlobal').checked;
                        
                        if (!name || !command) {
                            vscode.postMessage({
                                command: 'error',
                                text: 'Please fill all fields'
                            });
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'saveCommand',
                            commandData: { name, command, global: isGlobal }
                        });
                    }
                </script>
            </body>
        </html>`;
    }

    static show(context, editCommand = null) {
        if (CommandFormPanel.currentPanel) {
            CommandFormPanel.currentPanel.panel.reveal();
        } else {
            CommandFormPanel.currentPanel = new CommandFormPanel(context, editCommand);
        }
    }
}

class CommandTreeDataProvider {
    constructor(context) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.context = context; // Global state için context'i sakla
        this.loadCommands();
        this.setupFileWatcher();
    }

    setupFileWatcher() {
        // Sadece local commands.json'u izle
        this.updateLocalWatcher();
        
        // Workspace değişikliğini dinle
        this.workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.updateLocalWatcher();
            this.refresh();
        });
    }

    updateLocalWatcher() {
        if (this.localWatcher) {
            this.localWatcher.close();
        }

        const localPath = fileUtils.getLocalPath();
        if (localPath) {
            try {
                this.localWatcher = fs.watchFile(localPath, { interval: 500 }, () => {
                    this.refresh();
                });
            } catch (err) {
                console.log('Local commands.json not found or cannot be watched');
            }
        }
    }

    dispose() {
        if (this.localWatcher) {
            this.localWatcher.close();
        }
        if (this.workspaceListener) {
            this.workspaceListener.dispose();
        }
    }

    loadCommands() {
        // Global komutları VSCode storage'dan al
        const globalCommands = this.context.globalState.get('globalCommands', []);
        
        // Local commands.json dosyasını kontrol et ve yoksa oluştur
        const localPath = fileUtils.getLocalPath();
        let localCommands = [];

        if (localPath) {
            try {
                // Dosya var mı kontrol et
                if (!fs.existsSync(localPath)) {
                    // Yoksa varsayılan bir commands.json oluştur
                    const defaultCommands = {
                        commands: []
                    };
                    fs.writeFileSync(localPath, JSON.stringify(defaultCommands, null, 2));
                }
                
                // Dosyayı oku
                const content = fs.readFileSync(localPath, 'utf8');
                localCommands = JSON.parse(content).commands || [];
            } catch (err) {
                console.error('Error loading local commands:', err);
                localCommands = [];
            }
        }

        // Global ve local komutları birleştir
        this.commands = [...globalCommands, ...localCommands];
    }

    getTreeItem(element) {
        const item = new vscode.TreeItem(element.name);
        item.description = element.command;
        item.contextValue = 'command';
        // Global/local tooltip'i dosya konumuna göre belirlenecek
        item.tooltip = this.isGlobalCommand(element) ? 'Global Command' : 'Local Command';
        return item;
    }

    isGlobalCommand(command) {
        const globalCommands = this.context.globalState.get('globalCommands', []);
        return globalCommands.some(cmd => cmd.name === command.name);
    }

    async moveCommandToTop(command) {
        if (this.isGlobalCommand(command)) {
            // Global komutları güncelle
            const globalCommands = this.context.globalState.get('globalCommands', []);
            const updatedCommands = globalCommands.filter(cmd => cmd.name !== command.name);
            updatedCommands.unshift(command);
            await this.context.globalState.update('globalCommands', updatedCommands);
        } else {
            // Local komutları güncelle
            const localPath = fileUtils.getLocalPath();
            if (!localPath) return;

            const commands = fileUtils.readJsonFile(localPath);
            commands.commands = commands.commands.filter(cmd => cmd.name !== command.name);
            commands.commands.unshift(command);
            fs.writeFileSync(localPath, JSON.stringify(commands, null, 2));
        }
        this.refresh();
    }

    async deleteCommand(command) {
        if (this.isGlobalCommand(command)) {
            // Global komutu sil
            const globalCommands = this.context.globalState.get('globalCommands', []);
            const updatedCommands = globalCommands.filter(cmd => cmd.name !== command.name);
            await this.context.globalState.update('globalCommands', updatedCommands);
        } else {
            // Local komutu sil
            const localPath = fileUtils.getLocalPath();
            if (!localPath) return;

            const commands = fileUtils.readJsonFile(localPath);
            commands.commands = commands.commands.filter(cmd => cmd.name !== command.name);
            fs.writeFileSync(localPath, JSON.stringify(commands, null, 2));
        }
        this.refresh();
    }

    getChildren() {
        return this.commands || [];
    }

    async addCommand(command) {
        if (command.global) {
            // Global komutları VSCode storage'a kaydet
            const globalCommands = this.context.globalState.get('globalCommands', []);
            globalCommands.unshift(command);
            await this.context.globalState.update('globalCommands', globalCommands);
        } else {
            // Local komutları dosyaya kaydet
            const localPath = fileUtils.getLocalPath();
            if (!localPath) return;

            const localCommands = fileUtils.readJsonFile(localPath);
            localCommands.commands.unshift(command);
            fs.writeFileSync(localPath, JSON.stringify(localCommands, null, 2));
        }
        this.refresh();
    }

    refresh() {
        this.loadCommands();
        this._onDidChangeTreeData.fire();
    }
}

function activate(context) {
    // İlk kez çalıştırıldığında global komutları kontrol et
    const globalCommands = context.globalState.get('globalCommands');
    if (!globalCommands) {
        // Global commands henüz set edilmemişse boş array olarak başlat
        context.globalState.update('globalCommands', []);
    }

    const commandProvider = new CommandTreeDataProvider(context);
    
    // Provider'ı dispose etmek için context'e ekle
    context.subscriptions.push({ dispose: () => commandProvider.dispose() });

    // Add command
    let addCommand = vscode.commands.registerCommand('command-runner.addCommand', () => {
        CommandFormPanel.show(context);
    });

    // Refresh command
    let refreshCommand = vscode.commands.registerCommand('command-runner.refresh', () => {
        commandProvider.refresh();
        vscode.window.showInformationMessage('Commands refreshed');
    });

    // AutoRun toggle command
    let toggleAutoRun = vscode.commands.registerCommand('command-runner.toggleAutoRun', async () => {
        const config = vscode.workspace.getConfiguration('commandRunner');
        const currentValue = config.get('autoRun');
        await config.update('autoRun', !currentValue, true);
        
        vscode.window.showInformationMessage(`Auto Run: ${!currentValue ? 'Enabled' : 'Disabled'}`);
    });

    // Terminal commands with moveCommandToTop
    let sendToCurrentTerminal = vscode.commands.registerCommand('command-runner.sendToCurrent', (item) => {
        const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
        terminal.show();
        const autoRun = vscode.workspace.getConfiguration('commandRunner').get('autoRun');
        terminal.sendText(item.command, autoRun); // autoRun false ise true gönder (enter'a basmadan bekle)
        commandProvider.moveCommandToTop(item);
    });

    let sendToNewTerminal = vscode.commands.registerCommand('command-runner.sendToNew', (item) => {
        const terminal = vscode.window.createTerminal('Command Runner');
        terminal.show();
        const autoRun = vscode.workspace.getConfiguration('commandRunner').get('autoRun');
        terminal.sendText(item.command, autoRun); // autoRun false ise true gönder (enter'a basmadan bekle)
        commandProvider.moveCommandToTop(item);
    });

    // Delete command
    let deleteCommand = vscode.commands.registerCommand('command-runner.deleteCommand', async (item) => {
        const answer = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${item.name}"?`,
            { modal: true },
            'Yes',
            'No'
        );
        
        if (answer === 'Yes') {
            await commandProvider.deleteCommand(item);
            vscode.window.showInformationMessage(`Command "${item.name}" deleted`);
        }
    });

    // Edit command
    let editCommand = vscode.commands.registerCommand('command-runner.editCommand', (item) => {
        CommandFormPanel.show(context, item);
    });

    // Export global commands
    let exportGlobalCommands = vscode.commands.registerCommand('command-runner.exportGlobalCommands', async () => {
        const globalCommands = context.globalState.get('globalCommands', []);
        
        if (globalCommands.length === 0) {
            vscode.window.showInformationMessage('No global commands to export');
            return;
        }

        const exportData = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            globalCommands: globalCommands
        };

        const options = {
            defaultUri: vscode.Uri.file('global-commands-backup.json'),
            filters: {
                'JSON files': ['json']
            }
        };

        const fileUri = await vscode.window.showSaveDialog(options);
        if (fileUri) {
            try {
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(JSON.stringify(exportData, null, 2)));
                vscode.window.showInformationMessage(`Global commands exported to ${fileUri.fsPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export commands: ${error.message}`);
            }
        }
    });

    // Import global commands
    let importGlobalCommands = vscode.commands.registerCommand('command-runner.importGlobalCommands', async () => {
        const options = {
            canSelectMany: false,
            filters: {
                'JSON files': ['json']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri[0]);
                const importData = JSON.parse(fileContent.toString());

                // Validate the imported data
                if (!importData.globalCommands || !Array.isArray(importData.globalCommands)) {
                    vscode.window.showErrorMessage('Invalid backup file format');
                    return;
                }

                // Ask user for import strategy
                const strategy = await vscode.window.showQuickPick([
                    { label: 'Replace All', description: 'Replace all existing global commands' },
                    { label: 'Merge', description: 'Add to existing global commands (duplicates will be skipped)' }
                ], {
                    placeHolder: 'How do you want to import the commands?'
                });

                if (!strategy) return;

                const currentGlobalCommands = context.globalState.get('globalCommands', []);
                let newGlobalCommands;

                if (strategy.label === 'Replace All') {
                    newGlobalCommands = importData.globalCommands;
                } else {
                    // Merge - skip duplicates based on command name
                    const existingNames = new Set(currentGlobalCommands.map(cmd => cmd.name));
                    const newCommands = importData.globalCommands.filter(cmd => !existingNames.has(cmd.name));
                    newGlobalCommands = [...currentGlobalCommands, ...newCommands];
                }

                await context.globalState.update('globalCommands', newGlobalCommands);
                commandProvider.refresh();
                
                const importedCount = strategy.label === 'Replace All' 
                    ? importData.globalCommands.length 
                    : newGlobalCommands.length - currentGlobalCommands.length;
                
                vscode.window.showInformationMessage(`Successfully imported ${importedCount} global commands`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to import commands: ${error.message}`);
            }
        }
    });

    // Create tree view
    const treeView = vscode.window.createTreeView('command-list', {
        treeDataProvider: commandProvider
    });

    context.subscriptions.push(
        treeView,
        addCommand,
        refreshCommand,
        sendToCurrentTerminal,
        sendToNewTerminal,
        toggleAutoRun,
        deleteCommand,
        editCommand,
        exportGlobalCommands,
        importGlobalCommands
    );
}

exports.activate = activate;
