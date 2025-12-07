import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { encrypt, decrypt, isEncrypted } from './encryption';

const unlockedNotes = new Map<string, string>();
const openEncryptedDocs = new Map<string, string>();
const rememberedPasswords = new Map<string, string>();

export function activate(context: vscode.ExtensionContext) {
    console.log('Markdown Notes está activo');

    const notesProvider = new NotesProvider(context);
    const treeView = vscode.window.createTreeView('markdownNotesExplorer', {
        treeDataProvider: notesProvider,
        showCollapseAll: true,
        dragAndDropController: notesProvider
    });

    // Comando: Seleccionar directorio
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.selectDirectory', async () => {
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Seleccionar Directorio de Notas'
            });

            if (folderUri && folderUri[0]) {
                await context.globalState.update('markdownNotes.notesDirectory', folderUri[0].fsPath);
                notesProvider.refresh();
                vscode.window.showInformationMessage(`Directorio seleccionado: ${folderUri[0].fsPath}`);
            }
        })
    );

    // Comando: Refrescar
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.refresh', () => {
            notesProvider.refresh();
        })
    );

    // Comando: Crear nota
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.createNote', async (node?: NoteItem) => {
            const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {
                vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
                return;
            }

            const fileName = await vscode.window.showInputBox({
                prompt: 'Nombre de la nota (sin extensión)',
                placeHolder: 'mi-nota'
            });

            if (fileName) {
                const targetDir = node?.resourceUri?.fsPath || notesDir;
                const finalDir = fs.statSync(targetDir).isDirectory() ? targetDir : path.dirname(targetDir);
                const filePath = path.join(finalDir, `${fileName}.md`);

                if (fs.existsSync(filePath)) {
                    vscode.window.showErrorMessage('Ya existe una nota con ese nombre');
                    return;
                }

                const content = `# ${fileName}\n\n`;
                fs.writeFileSync(filePath, content);
                notesProvider.refresh();
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc);
            }
        })
    );

    // Comando: Crear carpeta
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.createFolder', async (node?: NoteItem) => {
            const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {
                vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
                return;
            }

            const folderName = await vscode.window.showInputBox({
                prompt: 'Nombre de la carpeta',
                placeHolder: 'nueva-carpeta'
            });

            if (folderName) {
                const targetDir = node?.resourceUri?.fsPath || notesDir;
                const finalDir = fs.statSync(targetDir).isDirectory() ? targetDir : path.dirname(targetDir);
                const folderPath = path.join(finalDir, folderName);

                if (fs.existsSync(folderPath)) {
                    vscode.window.showErrorMessage('Ya existe una carpeta con ese nombre');
                    return;
                }

                fs.mkdirSync(folderPath, { recursive: true });
                notesProvider.refresh();
                vscode.window.showInformationMessage(`Carpeta creada: ${folderName}`);
            }
        })
    );

    // Comando: Abrir nota
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.openNote', async (node: NoteItem) => {
            if (!node.resourceUri) {return;}

            const filePath = node.resourceUri.fsPath;
            let content = fs.readFileSync(filePath, 'utf8');

            if (isEncrypted(content)) {
                if (!unlockedNotes.has(filePath)) {
                    const password = await vscode.window.showInputBox({
                        prompt: 'Esta nota está protegida. Ingresa la contraseña',
                        password: true,
                        placeHolder: 'Contraseña'
                    });

                    if (!password) {return;}

                    const decrypted = decrypt(content, password);
                    if (!decrypted) {
                        vscode.window.showErrorMessage('Contraseña incorrecta');
                        return;
                    }

                    unlockedNotes.set(filePath, password);
                    rememberedPasswords.set(filePath, password);
                    openEncryptedDocs.set(filePath, content);
                    
                    fs.writeFileSync(filePath, decrypted, 'utf8');
                    notesProvider.refresh();
                } else {
                    const password = unlockedNotes.get(filePath)!;
                    const decrypted = decrypt(content, password);
                    
                    if (!decrypted) {
                        vscode.window.showErrorMessage('Error al desencriptar la nota');
                        return;
                    }
                    
                    openEncryptedDocs.set(filePath, content);
                    fs.writeFileSync(filePath, decrypted, 'utf8');
                }
            }

            const doc = await vscode.workspace.openTextDocument(node.resourceUri);
            await vscode.window.showTextDocument(doc);
        })
    );

    // Comando: Renombrar
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.renameNote', async (node: NoteItem) => {
            if (!node.resourceUri) {return;}

            const oldPath = node.resourceUri.fsPath;
            const oldName = path.basename(oldPath);
            const isFolder = node.contextValue === 'folder';
            const currentName = isFolder ? oldName : oldName.replace('.md', '');

            const newName = await vscode.window.showInputBox({
                prompt: `Renombrar ${isFolder ? 'carpeta' : 'nota'}`,
                value: currentName,
                placeHolder: currentName
            });

            if (newName && newName !== currentName) {
                const dir = path.dirname(oldPath);
                const newPath = path.join(dir, isFolder ? newName : `${newName}.md`);

                if (fs.existsSync(newPath)) {
                    vscode.window.showErrorMessage('Ya existe un elemento con ese nombre');
                    return;
                }

                try {
                    fs.renameSync(oldPath, newPath);
                    notesProvider.refresh();
                    vscode.window.showInformationMessage(`Renombrado a: ${newName}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Error al renombrar: ${error}`);
                }
            }
        })
    );

    // Comando: Eliminar
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.deleteNote', async (node: NoteItem) => {
            if (!node.resourceUri) {return;}

            const itemPath = node.resourceUri.fsPath;
            const itemName = path.basename(itemPath);
            const isFolder = node.contextValue === 'folder';

            const confirmation = await vscode.window.showWarningMessage(
                `¿Estás seguro de que quieres eliminar ${isFolder ? 'la carpeta' : 'la nota'} "${itemName}"?`,
                { modal: true },
                'Eliminar'
            );

            if (confirmation === 'Eliminar') {
                try {
                    if (isFolder) {
                        fs.rmSync(itemPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(itemPath);
                        unlockedNotes.delete(itemPath);
                        rememberedPasswords.delete(itemPath);
                        openEncryptedDocs.delete(itemPath);
                    }
                    notesProvider.refresh();
                    vscode.window.showInformationMessage(`Eliminado: ${itemName}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Error al eliminar: ${error}`);
                }
            }
        })
    );

    // Comando: Proteger nota
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.protectNote', async (node: NoteItem) => {
            if (!node.resourceUri) {return;}

            const filePath = node.resourceUri.fsPath;
            
            if (!filePath.endsWith('.md')) {
                vscode.window.showWarningMessage('Solo se pueden proteger archivos markdown');
                return;
            }

            const content = fs.readFileSync(filePath, 'utf8');

            if (isEncrypted(content)) {
                vscode.window.showInformationMessage('Esta nota ya está protegida');
                return;
            }

            const password = await vscode.window.showInputBox({
                prompt: 'Ingresa una contraseña para proteger esta nota',
                password: true,
                placeHolder: 'Contraseña',
                validateInput: (value) => {
                    if (!value || value.length < 4) {
                        return 'La contraseña debe tener al menos 4 caracteres';
                    }
                    return null;
                }
            });

            if (!password) {return;}

            const confirmPassword = await vscode.window.showInputBox({
                prompt: 'Confirma la contraseña',
                password: true,
                placeHolder: 'Contraseña'
            });

            if (password !== confirmPassword) {
                vscode.window.showErrorMessage('Las contraseñas no coinciden');
                return;
            }

            const encrypted = encrypt(content, password);
            fs.writeFileSync(filePath, encrypted, 'utf8');
            
            rememberedPasswords.set(filePath, password);
            unlockedNotes.set(filePath, password);
            
            notesProvider.refresh();
            vscode.window.showInformationMessage('Nota protegida con éxito');
        })
    );

    // Comando: Desbloquear nota
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.unlockNote', async (node: NoteItem) => {
            if (!node.resourceUri) {return;}

            const filePath = node.resourceUri.fsPath;
            const content = fs.readFileSync(filePath, 'utf8');

            if (!isEncrypted(content)) {
                vscode.window.showInformationMessage('Esta nota no está protegida');
                return;
            }

            let password: string;

            if (rememberedPasswords.has(filePath)) {
                password = rememberedPasswords.get(filePath)!;
            } else {
                const inputPassword = await vscode.window.showInputBox({
                    prompt: 'Ingresa la contraseña',
                    password: true,
                    placeHolder: 'Contraseña'
                });

                if (!inputPassword) {return;}
                password = inputPassword;
            }

            const decrypted = decrypt(content, password);
            if (!decrypted) {
                vscode.window.showErrorMessage('Contraseña incorrecta');
                return;
            }

            unlockedNotes.set(filePath, password);
            rememberedPasswords.set(filePath, password);
            notesProvider.refresh();
            vscode.window.showInformationMessage('Nota desbloqueada');
        })
    );

    // Comando: Bloquear nota
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.lockNote', async (node: NoteItem) => {
            if (!node.resourceUri) {return;}

            const filePath = node.resourceUri.fsPath;
            
            if (unlockedNotes.has(filePath)) {
                unlockedNotes.delete(filePath);
                
                if (openEncryptedDocs.has(filePath)) {
                    const encryptedContent = openEncryptedDocs.get(filePath)!;
                    fs.writeFileSync(filePath, encryptedContent, 'utf8');
                    openEncryptedDocs.delete(filePath);
                }
                
                notesProvider.refresh();
                vscode.window.showInformationMessage('Nota bloqueada');
            }
        })
    );

    // Comando: Mover nota
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.moveNote', async (node: NoteItem) => {
            if (!node.resourceUri) {return;}

            const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {return;}

            const sourcePath = node.resourceUri.fsPath;
            const folders = getAllFolders(notesDir);

            const selectedFolder = await vscode.window.showQuickPick(
                ['📁 Raíz', ...folders.map(f => `📂 ${path.relative(notesDir, f)}`)],
                { placeHolder: 'Selecciona la carpeta destino' }
            );

            if (!selectedFolder) {return;}

            const targetDir = selectedFolder === '📁 Raíz' 
                ? notesDir 
                : path.join(notesDir, selectedFolder.replace('📂 ', ''));

            const fileName = path.basename(sourcePath);
            const targetPath = path.join(targetDir, fileName);

            if (sourcePath === targetPath) {
                vscode.window.showInformationMessage('La nota ya está en esa ubicación');
                return;
            }

            if (fs.existsSync(targetPath)) {
                vscode.window.showErrorMessage('Ya existe un archivo con ese nombre en la carpeta destino');
                return;
            }

            try {
                fs.renameSync(sourcePath, targetPath);
                
                if (rememberedPasswords.has(sourcePath)) {
                    const password = rememberedPasswords.get(sourcePath);
                    rememberedPasswords.delete(sourcePath);
                    if (password) {
                        rememberedPasswords.set(targetPath, password);
                    }
                }
                
                if (unlockedNotes.has(sourcePath)) {
                    const password = unlockedNotes.get(sourcePath);
                    unlockedNotes.delete(sourcePath);
                    if (password) {
                        unlockedNotes.set(targetPath, password);
                    }
                }

                notesProvider.refresh();
                vscode.window.showInformationMessage(`Nota movida a: ${path.relative(notesDir, targetDir)}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error al mover: ${error}`);
            }
        })
    );

    context.subscriptions.push(treeView);

    const savedDir = context.globalState.get<string>('markdownNotes.notesDirectory');
    if (savedDir) {
        notesProvider.refresh();
    }

    // Escuchar cuando se guarda un documento
    vscode.workspace.onDidSaveTextDocument((document) => {
        const filePath = document.uri.fsPath;
        
        if (openEncryptedDocs.has(filePath)) {
            const password = unlockedNotes.get(filePath) || rememberedPasswords.get(filePath);
            
            if (password) {
                const content = document.getText();
                const encrypted = encrypt(content, password);
                
                openEncryptedDocs.set(filePath, encrypted);
                
                fs.writeFileSync(filePath, encrypted, 'utf8');
                
                notesProvider.refresh();
            }
        }
    });
}

export function deactivate() {}

function getAllFolders(dir: string): string[] {
    const folders: string[] = [];
    
    function scan(currentDir: string) {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const fullPath = path.join(currentDir, entry.name);
                    folders.push(fullPath);
                    scan(fullPath);
                }
            }
        } catch (error) {
            // Ignorar errores
        }
    }
    
    scan(dir);
    return folders;
}

// NotesProvider
class NotesProvider implements vscode.TreeDataProvider<NoteItem>, vscode.TreeDragAndDropController<NoteItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<NoteItem | undefined | null | void> = new vscode.EventEmitter<NoteItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NoteItem | undefined | null | void> = this._onDidChangeTreeData.event;

    dropMimeTypes = ['application/vnd.code.tree.markdownNotesExplorer', 'text/uri-list'];
    dragMimeTypes = ['text/uri-list'];

    constructor(private context: vscode.ExtensionContext) {}

    public async handleDrag(source: NoteItem[], dataTransfer: vscode.DataTransfer): Promise<void> {
        const uris = source.map(item => item.resourceUri);
        dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris));
    }

    public async handleDrop(target: NoteItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const notesDir = this.context.globalState.get<string>('markdownNotes.notesDirectory');
        if (!notesDir) {return;}

        let targetDir: string;
        if (!target) {
            targetDir = notesDir;
        } else if (target.contextValue === 'folder') {
            targetDir = target.resourceUri.fsPath;
        } else {
            targetDir = path.dirname(target.resourceUri.fsPath);
        }

        let uris: vscode.Uri[] = [];
        
        const uriListItem = dataTransfer.get('text/uri-list');
        if (uriListItem) {
            const value = uriListItem.value;
            if (Array.isArray(value)) {
                uris = value;
            } else if (typeof value === 'string') {
                const uriStrings = value.split('\n').filter(s => s.trim());
                uris = uriStrings.map(s => vscode.Uri.parse(s.trim()));
            } else if (value instanceof vscode.Uri) {
                uris = [value];
            }
        }

        if (uris.length === 0) {
            const filesItem = dataTransfer.get('Files');
            if (filesItem) {
                const files = filesItem.value;
                if (Array.isArray(files)) {
                    uris = files;
                }
            }
        }

        if (uris.length === 0) {
            vscode.window.showInformationMessage('No se detectaron archivos para copiar');
            return;
        }

        for (const uri of uris) {
            try {
                const sourcePath = uri.fsPath;
                if (!sourcePath || !fs.existsSync(sourcePath)) {continue;}

                const fileName = path.basename(sourcePath);
                const targetPath = path.join(targetDir, fileName);

                if (sourcePath === targetPath) {continue;}

                if (fs.existsSync(targetPath)) {
                    vscode.window.showErrorMessage(`Ya existe: ${fileName}`);
                    continue;
                }

                if (sourcePath.startsWith(notesDir)) {
                    const isFile = fs.statSync(sourcePath).isFile();
                    if (isFile && rememberedPasswords.has(sourcePath)) {
                        const password = rememberedPasswords.get(sourcePath);
                        rememberedPasswords.delete(sourcePath);
                        if (password) {
                            rememberedPasswords.set(targetPath, password);
                        }
                    }
                    
                    if (unlockedNotes.has(sourcePath)) {
                        const password = unlockedNotes.get(sourcePath);
                        unlockedNotes.delete(sourcePath);
                        if (password) {
                            unlockedNotes.set(targetPath, password);
                        }
                    }

                    fs.renameSync(sourcePath, targetPath);
                } else {
                    if (fs.statSync(sourcePath).isDirectory()) {
                        copyDirectoryRecursive(sourcePath, targetPath);
                    } else {
                        fs.copyFileSync(sourcePath, targetPath);
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error: ${error}`);
            }
        }

        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: NoteItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: NoteItem): Promise<NoteItem[]> {
        const notesDir = this.context.globalState.get<string>('markdownNotes.notesDirectory');

        if (!notesDir) {return [];}

        const dirPath = element?.resourceUri.fsPath || notesDir;

        if (!fs.existsSync(dirPath)) {
            vscode.window.showErrorMessage('El directorio de notas no existe');
            return [];
        }

        const items: NoteItem[] = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.')) {continue;}

            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                items.push(new NoteItem(
                    entry.name,
                    vscode.Uri.file(fullPath),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'folder'
                ));
            } else {
                const isMarkdown = entry.name.endsWith('.md');
                let encrypted = false;
                let unlocked = false;
                let isProtected = false;
                
                if (isMarkdown) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    encrypted = isEncrypted(content);
                    unlocked = unlockedNotes.has(fullPath);
                    isProtected = rememberedPasswords.has(fullPath);
                }
                
                items.push(new NoteItem(
                    entry.name,
                    vscode.Uri.file(fullPath),
                    vscode.TreeItemCollapsibleState.None,
                    'file',
                    encrypted || isProtected,
                    unlocked,
                    isMarkdown
                ));
            }
        }

        items.sort((a, b) => {
            if (a.contextValue === b.contextValue) {
                return a.label!.toString().localeCompare(b.label!.toString());
            }
            return a.contextValue === 'folder' ? -1 : 1;
        });

        return items;
    }
}

class NoteItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        contextValue: 'file' | 'folder',
        public readonly isEncrypted: boolean = false,
        public readonly isUnlocked: boolean = false,
        public readonly isMarkdown: boolean = true
    ) {
        super(label, collapsibleState);

        this.resourceUri = resourceUri;
        
        if (contextValue === 'file') {
            if (isEncrypted && !isUnlocked) {
                this.contextValue = 'protectedNote';
            } else if (isEncrypted && isUnlocked) {
                this.contextValue = 'unlockedNote';
            } else {
                this.contextValue = 'note';
            }
            
            if (isMarkdown) {
                this.command = {
                    command: 'markdownNotes.openNote',
                    title: 'Abrir Nota',
                    arguments: [this]
                };
            } else {
                this.command = {
                    command: 'vscode.open',
                    title: 'Abrir Archivo',
                    arguments: [this.resourceUri]
                };
            }
            
            if (isEncrypted && !isUnlocked) {
                this.iconPath = new vscode.ThemeIcon('lock', new vscode.ThemeColor('errorForeground'));
            } else if (isEncrypted && isUnlocked) {
                this.iconPath = new vscode.ThemeIcon('unlock', new vscode.ThemeColor('terminal.ansiGreen'));
            } else if (isMarkdown) {
                this.iconPath = new vscode.ThemeIcon('markdown');
            } else {
                this.iconPath = vscode.ThemeIcon.File;
            }
        } else {
            this.contextValue = 'folder';
            this.iconPath = new vscode.ThemeIcon('folder-opened');
        }

        this.tooltip = this.resourceUri.fsPath;
    }
}

function copyDirectoryRecursive(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirectoryRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
