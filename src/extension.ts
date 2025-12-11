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

    // Comando: Crear archivo
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.createNote', async (node?: NoteItem) => {
            const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {
                vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
                return;
            }

            const fileName = await vscode.window.showInputBox({
                prompt: 'Nombre del archivo (con o sin extensión)',
                placeHolder: 'mi-archivo.txt o mi-nota'
            });

            if (fileName) {
                const targetDir = node?.resourceUri?.fsPath || notesDir;
                const finalDir = fs.statSync(targetDir).isDirectory() ? targetDir : path.dirname(targetDir);
                
                // Detectar si ya tiene extensión, sino agregar .md por defecto
                let finalFileName = fileName;
                const hasExtension = path.extname(fileName) !== '';
                if (!hasExtension) {
                    finalFileName = `${fileName}.md`;
                }

                const filePath = path.join(finalDir, finalFileName);

                if (fs.existsSync(filePath)) {
                    vscode.window.showErrorMessage('Ya existe un archivo con ese nombre');
                    return;
                }

                // Determinar contenido inicial según la extensión
                let content = '';
                const extension = path.extname(finalFileName).toLowerCase();
                const baseName = path.basename(finalFileName, extension);

                switch (extension) {
                    case '.md':
                        content = `# ${baseName}\n\n`;
                        break;
                    case '.txt':
                        content = `${baseName}\n${'='.repeat(baseName.length)}\n\n`;
                        break;
                    case '.js':
                        content = `// ${baseName}\n\n`;
                        break;
                    case '.ts':
                        content = `// ${baseName}\n\n`;
                        break;
                    case '.py':
                        content = `# ${baseName}\n\n`;
                        break;
                    case '.html':
                        content = `<!DOCTYPE html>\n<html>\n<head>\n    <title>${baseName}</title>\n</head>\n<body>\n    \n</body>\n</html>\n`;
                        break;
                    case '.css':
                        content = `/* ${baseName} */\n\n`;
                        break;
                    case '.json':
                        content = `{\n    \n}\n`;
                        break;
                    default:
                        content = '';
                }

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

    // Comando: Crear nuevo item (menú unificado)
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.createNewItem', async (node?: NoteItem) => {
            const options = ['📄 Crear Archivo', '📁 Crear Carpeta'];
            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Selecciona qué deseas crear'
            });

            if (!selected) return;

            if (selected.includes('Archivo')) {
                // Ejecutar comando de crear nota
                vscode.commands.executeCommand('markdownNotes.createNote', node);
            } else if (selected.includes('Carpeta')) {
                // Ejecutar comando de crear carpeta
                vscode.commands.executeCommand('markdownNotes.createFolder', node);
            }
        })
    );

    // Comando: Colapsar todo
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.collapseAll', () => {
            vscode.commands.executeCommand('workbench.actions.treeView.markdownNotesExplorer.collapseAll');
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

    // Comando: Pegar contenido desde portapapeles
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.pasteContent', async () => {
            const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {
                vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
                return;
            }

            try {
                // Intentar leer diferentes tipos de contenido del portapapeles
                let handled = false;

                // Primero intentar detectar si hay una imagen en el portapapeles
                try {
                    const imageData = await getImageFromClipboard();
                    if (imageData) {
                        await handleImageFromClipboard(imageData, notesDir, notesProvider);
                        handled = true;
                        return;
                    }
                } catch (e) {
                    // Continuar con otros métodos
                }

                // Luego intentar detectar si hay archivos en el portapapeles (usando comando nativo)
                try {
                    const filesInClipboard = await getFilesFromClipboard();
                    if (filesInClipboard && filesInClipboard.length > 0) {
                        await handleFilesFromClipboard(filesInClipboard, notesDir, notesProvider);
                        handled = true;
                        return;
                    }
                } catch (e) {
                    // Continuar con otros métodos
                }

                // Intentar leer texto del portapapeles
                const clipboardContent = await vscode.env.clipboard.readText();
                
                if (clipboardContent && clipboardContent.trim() !== '') {
                    await handlePasteContent(clipboardContent, notesDir, notesProvider);
                    handled = true;
                    return;
                }

                if (!handled) {
                    vscode.window.showInformationMessage('No se detectó contenido en el portapapeles. Intenta copiar el archivo, imagen o texto nuevamente.');
                }

            } catch (error) {
                vscode.window.showErrorMessage(`Error al leer portapapeles: ${error}`);
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

    // Wiki Links - Definition Provider
    const wikiLinkDefinitionProvider = vscode.languages.registerDefinitionProvider(
        ['markdown', 'plaintext'],
        new WikiLinkDefinitionProvider(context)
    );

    // Wiki Links - Hover Provider
    const wikiLinkHoverProvider = vscode.languages.registerHoverProvider(
        ['markdown', 'plaintext'],
        new WikiLinkHoverProvider(context)
    );

    // Wiki Links - Document Link Provider para cmd+click
    const wikiLinkDocumentLinkProvider = vscode.languages.registerDocumentLinkProvider(
        ['markdown', 'plaintext'],
        new WikiLinkDocumentLinkProvider()
    );

    // Comando: Navegar a wiki link
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.followWikiLink', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const document = editor.document;
            const position = editor.selection.active;
            const line = document.lineAt(position.line).text;
            const wikiLinkMatch = extractWikiLinkAtPosition(line, position.character);

            if (wikiLinkMatch) {
                await navigateToWikiLink(wikiLinkMatch, context, notesProvider);
            } else {
                vscode.window.showInformationMessage('No hay ningún wiki-link en la posición actual');
            }
        })
    );

    // Comando: Navegar desde click en document link
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.navigateToWikiLinkFromClick', async (args: any) => {
            if (args && args.linkText && args.sourceUri) {
                await navigateToWikiLinkRelative(args.linkText, args.sourceUri, context, notesProvider);
            }
        })
    );

    // Comando: Mostrar vista de grafo
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.showGraphView', async () => {
            const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {
                vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
                return;
            }

            // Crear y mostrar el panel de vista de grafo
            GraphViewPanel.createOrShow(context.extensionUri, notesDir);
        })
    );

    // Comando: Copiar archivo/carpeta
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.copyItem', async (node: NoteItem) => {
            if (!node?.resourceUri) return;
            
            const itemPath = node.resourceUri.fsPath;
            context.globalState.update('markdownNotes.copiedItem', {
                path: itemPath,
                isDirectory: node.contextValue === 'folder',
                operation: 'copy'
            });
            
            const itemName = path.basename(itemPath);
            vscode.window.showInformationMessage(`Copiado: ${itemName}`);
        })
    );

    // Comando: Duplicar archivo/carpeta
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.duplicateItem', async (node: NoteItem) => {
            if (!node?.resourceUri) return;
            
            const itemPath = node.resourceUri.fsPath;
            const isFolder = node.contextValue === 'folder';
            const itemName = path.basename(itemPath);
            const parentDir = path.dirname(itemPath);
            
            const newName = await vscode.window.showInputBox({
                prompt: `Nombre para la copia de ${isFolder ? 'carpeta' : 'archivo'}`,
                value: isFolder ? `${itemName} - Copia` : `${path.parse(itemName).name} - Copia${path.parse(itemName).ext}`,
                placeHolder: isFolder ? 'nueva-carpeta' : 'nuevo-archivo.md'
            });
            
            if (newName) {
                const newPath = path.join(parentDir, newName);
                
                if (fs.existsSync(newPath)) {
                    vscode.window.showErrorMessage('Ya existe un elemento con ese nombre');
                    return;
                }
                
                try {
                    if (isFolder) {
                        copyDirectoryRecursive(itemPath, newPath);
                    } else {
                        fs.copyFileSync(itemPath, newPath);
                    }
                    notesProvider.refresh();
                    vscode.window.showInformationMessage(`Duplicado: ${newName}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Error al duplicar: ${error}`);
                }
            }
        })
    );

    // Comando: Ir al directorio
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.revealInFileExplorer', async (node: NoteItem) => {
            if (!node?.resourceUri) {
                // Si no hay nodo, abrir el directorio de notas
                const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
                if (notesDir) {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(notesDir));
                }
                return;
            }
            
            vscode.commands.executeCommand('revealFileInOS', node.resourceUri);
        })
    );

    // Comando: Pegar
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.pasteItem', async (node?: NoteItem) => {
            const copiedItem = context.globalState.get<any>('markdownNotes.copiedItem');
            if (!copiedItem) {
                vscode.window.showWarningMessage('No hay ningún elemento copiado');
                return;
            }
            
            const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {
                vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
                return;
            }
            
            // Determinar directorio destino
            let targetDir = notesDir;
            if (node?.resourceUri) {
                const nodePath = node.resourceUri.fsPath;
                targetDir = node.contextValue === 'folder' ? nodePath : path.dirname(nodePath);
            }
            
            const sourcePath = copiedItem.path;
            const itemName = path.basename(sourcePath);
            const targetPath = path.join(targetDir, itemName);
            
            if (fs.existsSync(targetPath)) {
                vscode.window.showErrorMessage('Ya existe un elemento con ese nombre en el destino');
                return;
            }
            
            try {
                if (copiedItem.isDirectory) {
                    copyDirectoryRecursive(sourcePath, targetPath);
                } else {
                    fs.copyFileSync(sourcePath, targetPath);
                }
                notesProvider.refresh();
                vscode.window.showInformationMessage(`Pegado: ${itemName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error al pegar: ${error}`);
            }
        })
    );

    // Comando: Configurar directorio de notas
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownNotes.configureDirectory', async () => {
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Seleccionar Directorio de Notas'
            });

            if (folderUri && folderUri[0]) {
                await context.globalState.update('markdownNotes.notesDirectory', folderUri[0].fsPath);
                notesProvider.refresh();
                vscode.window.showInformationMessage(`Directorio configurado: ${folderUri[0].fsPath}`);
            }
        })
    );

    // Registrar autocompletado para wiki links
    const wikiLinkCompletionProvider = vscode.languages.registerCompletionItemProvider(
        'markdown',
        new WikiLinkCompletionProvider(context),
        '[' // Trigger character
    );

    // Auto-actualización de notas y grafos cuando hay cambios
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    
    fileWatcher.onDidCreate((uri) => {
        const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
        if (notesDir && uri.fsPath.startsWith(notesDir)) {
            notesProvider.refresh();
            if (GraphViewPanel.currentPanel) {
                GraphViewPanel.currentPanel.refreshGraph();
            }
        }
    });
    
    fileWatcher.onDidChange((uri) => {
        const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
        if (notesDir && uri.fsPath.startsWith(notesDir)) {
            // Solo actualizar grafos cuando cambia un archivo, no la lista de notas
            if (GraphViewPanel.currentPanel) {
                GraphViewPanel.currentPanel.refreshGraph();
            }
        }
    });
    
    fileWatcher.onDidDelete((uri) => {
        const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
        if (notesDir && uri.fsPath.startsWith(notesDir)) {
            notesProvider.refresh();
            if (GraphViewPanel.currentPanel) {
                GraphViewPanel.currentPanel.refreshGraph();
            }
        }
    });

    // También escuchar cambios en el workspace
    const workspaceWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
        const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
        if (notesDir && document.fileName.startsWith(notesDir)) {
            if (GraphViewPanel.currentPanel) {
                GraphViewPanel.currentPanel.refreshGraph();
            }
        }
    });

    context.subscriptions.push(wikiLinkDefinitionProvider, wikiLinkHoverProvider, wikiLinkDocumentLinkProvider, wikiLinkCompletionProvider, fileWatcher, workspaceWatcher);
}

export function deactivate() {}

// Obtener imagen del portapapeles usando comandos del sistema
async function getImageFromClipboard(): Promise<Buffer | null> {
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        const os = require('os');
        const platform = os.platform();

        let command = '';

        if (platform === 'darwin') {
            // macOS - usar osascript para obtener imagen del portapapeles
            command = `osascript -e 'set theFile to (open for access POSIX path of (path to temporary items) & "clipboard_image.png" with write permission)' -e 'try' -e 'write (the clipboard as «class PNGf») to theFile' -e 'close access theFile' -e 'return POSIX path of (path to temporary items) & "clipboard_image.png"' -e 'on error' -e 'try' -e 'close access theFile' -e 'end try' -e 'return ""' -e 'end try' 2>/dev/null`;
        } else if (platform === 'win32') {
            // Windows - usar PowerShell para obtener imagen del portapapeles
            command = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; $clipboard = [System.Windows.Forms.Clipboard]::GetImage(); if ($clipboard -ne $null) { $tempPath = [System.IO.Path]::GetTempPath() + 'clipboard_image.png'; $clipboard.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png); Write-Output $tempPath } else { Write-Output '' }"`;
        } else {
            // Linux - usar xclip para obtener imagen del portapapeles
            command = `xclip -selection clipboard -t image/png -o > /tmp/clipboard_image.png 2>/dev/null && echo "/tmp/clipboard_image.png" || echo ""`;
        }

        exec(command, (error: any, stdout: string) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve(null);
                return;
            }

            const imagePath = stdout.trim();
            
            if (platform === 'darwin' && imagePath && fs.existsSync(imagePath)) {
                try {
                    const imageBuffer = fs.readFileSync(imagePath);
                    // Limpiar archivo temporal
                    fs.unlinkSync(imagePath);
                    resolve(imageBuffer);
                } catch (e) {
                    resolve(null);
                }
            } else if (platform === 'win32' && imagePath && fs.existsSync(imagePath)) {
                try {
                    const imageBuffer = fs.readFileSync(imagePath);
                    // Limpiar archivo temporal
                    fs.unlinkSync(imagePath);
                    resolve(imageBuffer);
                } catch (e) {
                    resolve(null);
                }
            } else if (platform === 'linux' && fs.existsSync('/tmp/clipboard_image.png')) {
                try {
                    const imageBuffer = fs.readFileSync('/tmp/clipboard_image.png');
                    // Limpiar archivo temporal
                    fs.unlinkSync('/tmp/clipboard_image.png');
                    resolve(imageBuffer);
                } catch (e) {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    });
}

// Manejar imagen del portapapeles
async function handleImageFromClipboard(imageBuffer: Buffer, notesDir: string, notesProvider: NotesProvider) {
    const options = [
        '📁 Guardar en carpeta assets',
        '📄 Crear nueva nota con imagen'
    ];

    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: '¿Dónde quieres guardar la captura de pantalla?'
    });

    if (!selection) { return; }

    try {
        if (selection.startsWith('📁')) {
            await saveImageBufferToAssets(imageBuffer, notesDir);
        } else {
            await createNoteWithImageBuffer(imageBuffer, notesDir, notesProvider);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error al procesar imagen: ${error}`);
    }
}

// Guardar buffer de imagen en carpeta assets
async function saveImageBufferToAssets(imageBuffer: Buffer, notesDir: string) {
    const assetsDir = path.join(notesDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const currentDate = new Date();
    const timestamp = currentDate.toISOString().slice(0, 19).replace(/[:-]/g, '');
    const defaultName = `captura-${timestamp}`;

    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre del archivo de imagen (sin extensión)',
        value: defaultName,
        placeHolder: 'captura'
    });

    if (!fileName) { return; }

    const filePath = path.join(assetsDir, `${fileName}.png`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe un archivo con ese nombre');
        return;
    }

    fs.writeFileSync(filePath, imageBuffer);
    vscode.window.showInformationMessage(`Imagen guardada: assets/${fileName}.png`);
}

// Crear nueva nota con imagen desde buffer
async function createNoteWithImageBuffer(imageBuffer: Buffer, notesDir: string, notesProvider: NotesProvider) {
    // Primero guardar imagen en assets
    const assetsDir = path.join(notesDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const currentDate = new Date();
    const timestamp = currentDate.toISOString().slice(0, 19).replace(/[:-]/g, '');
    const defaultName = `captura-${timestamp}`;

    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre de la nota (sin extensión)',
        value: defaultName,
        placeHolder: 'nota-con-captura'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.md`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe una nota con ese nombre');
        return;
    }

    // Guardar imagen
    const imageFileName = `${fileName}.png`;
    const imageFilePath = path.join(assetsDir, imageFileName);
    fs.writeFileSync(imageFilePath, imageBuffer);

    // Crear nota
    const content = `# ${fileName}\n\n![${fileName}](assets/${imageFileName})\n\n`;
    fs.writeFileSync(filePath, content);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Nota con captura creada: ${fileName}.md`);
}

// Obtener archivos del portapapeles usando comandos del sistema
async function getFilesFromClipboard(): Promise<string[]> {
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        const os = require('os');
        const platform = os.platform();

        let command = '';

        if (platform === 'darwin') {
            // macOS - usar osascript para obtener rutas de archivos del portapapeles
            command = `osascript -e 'set theFiles to (the clipboard as «class furl») as text' -e 'return theFiles' 2>/dev/null || echo ""`;
        } else if (platform === 'win32') {
            // Windows - usar PowerShell
            command = `powershell -command "Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }"`;
        } else {
            // Linux - usar xclip
            command = `xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -q "text/uri-list" && xclip -selection clipboard -t text/uri-list -o 2>/dev/null || echo ""`;
        }

        exec(command, (error: any, stdout: string) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve([]);
                return;
            }

            let filePaths: string[] = [];

            if (platform === 'darwin') {
                // macOS devuelve URLs en formato file://
                const lines = stdout.trim().split('\n');
                filePaths = lines
                    .map(line => {
                        if (line.startsWith('file://')) {
                            return decodeURIComponent(line.replace('file://', ''));
                        }
                        return line;
                    })
                    .filter(p => p && fs.existsSync(p));
            } else if (platform === 'win32') {
                // Windows devuelve rutas directamente
                filePaths = stdout.trim().split('\n')
                    .map(p => p.trim())
                    .filter(p => p && fs.existsSync(p));
            } else {
                // Linux devuelve URLs
                const lines = stdout.trim().split('\n');
                filePaths = lines
                    .map(line => {
                        if (line.startsWith('file://')) {
                            return decodeURIComponent(line.replace('file://', ''));
                        }
                        return line;
                    })
                    .filter(p => p && fs.existsSync(p));
            }

            resolve(filePaths);
        });
    });
}

// Manejar archivos del portapapeles
async function handleFilesFromClipboard(filePaths: string[], notesDir: string, notesProvider: NotesProvider) {
    for (const filePath of filePaths) {
        const stats = fs.statSync(filePath);
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        // Detectar si es imagen
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
        const isImage = imageExtensions.includes(fileExt);

        if (isImage) {
            const options = [
                '📁 Copiar a carpeta assets',
                '📄 Crear nueva nota con imagen',
                '📋 Solo copiar al directorio de notas'
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: `¿Cómo quieres manejar la imagen "${fileName}"?`
            });

            if (!selection) { continue; }

            try {
                if (selection.startsWith('📁')) {
                    await copyImageToAssets(filePath, notesDir);
                } else if (selection.startsWith('📄')) {
                    await createNoteWithLocalImage(filePath, notesDir, notesProvider);
                } else {
                    const targetPath = path.join(notesDir, fileName);
                    if (fs.existsSync(targetPath)) {
                        vscode.window.showErrorMessage(`Ya existe un archivo llamado "${fileName}"`);
                        continue;
                    }
                    fs.copyFileSync(filePath, targetPath);
                    notesProvider.refresh();
                    vscode.window.showInformationMessage(`Archivo copiado: ${fileName}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error al copiar imagen: ${error}`);
            }
        } else if (stats.isFile()) {
            // Es un archivo de texto u otro tipo
            const content = fs.readFileSync(filePath, 'utf8');
            
            const options = [
                '📝 Crear como nota Markdown (.md)',
                '📋 Copiar archivo tal cual',
                '🔧 Cambiar extensión'
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: `¿Cómo quieres importar "${fileName}"?`
            });

            if (!selection) { continue; }

            if (selection.startsWith('📝')) {
                await createMarkdownNoteFromFile(content, fileName, notesDir, notesProvider);
            } else if (selection.startsWith('📋')) {
                const targetPath = path.join(notesDir, fileName);
                if (fs.existsSync(targetPath)) {
                    vscode.window.showErrorMessage(`Ya existe un archivo llamado "${fileName}"`);
                    continue;
                }
                fs.copyFileSync(filePath, targetPath);
                notesProvider.refresh();
                vscode.window.showInformationMessage(`Archivo copiado: ${fileName}`);
            } else {
                await createCustomExtensionFileFromContent(content, notesDir, notesProvider);
            }
        } else if (stats.isDirectory()) {
            // Copiar carpeta completa
            const targetPath = path.join(notesDir, fileName);
            if (fs.existsSync(targetPath)) {
                vscode.window.showErrorMessage(`Ya existe una carpeta llamada "${fileName}"`);
                continue;
            }
            copyDirectoryRecursive(filePath, targetPath);
            notesProvider.refresh();
            vscode.window.showInformationMessage(`Carpeta copiada: ${fileName}`);
        }
    }
}

// Copiar imagen a carpeta assets
async function copyImageToAssets(imagePath: string, notesDir: string) {
    const assetsDir = path.join(notesDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const fileName = path.basename(imagePath);
    const targetPath = path.join(assetsDir, fileName);

    if (fs.existsSync(targetPath)) {
        const newName = await vscode.window.showInputBox({
            prompt: `Ya existe "${fileName}". Ingresa un nuevo nombre (con extensión)`,
            value: fileName
        });
        
        if (!newName) { return; }
        
        const newTargetPath = path.join(assetsDir, newName);
        fs.copyFileSync(imagePath, newTargetPath);
        vscode.window.showInformationMessage(`Imagen guardada: assets/${newName}`);
    } else {
        fs.copyFileSync(imagePath, targetPath);
        vscode.window.showInformationMessage(`Imagen guardada: assets/${fileName}`);
    }
}

// Crear nota con imagen local
async function createNoteWithLocalImage(imagePath: string, notesDir: string, notesProvider: NotesProvider) {
    // Primero copiar imagen a assets
    const assetsDir = path.join(notesDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const imageFileName = path.basename(imagePath);
    const imageTargetPath = path.join(assetsDir, imageFileName);
    
    if (!fs.existsSync(imageTargetPath)) {
        fs.copyFileSync(imagePath, imageTargetPath);
    }

    // Crear nota
    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre de la nota (sin extensión)',
        placeHolder: 'nota-con-imagen'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.md`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe una nota con ese nombre');
        return;
    }

    const content = `# ${fileName}\n\n![${imageFileName}](assets/${imageFileName})\n\n`;
    fs.writeFileSync(filePath, content);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Nota con imagen creada: ${fileName}.md`);
}

// Crear nota markdown desde archivo
async function createMarkdownNoteFromFile(content: string, originalFileName: string, notesDir: string, notesProvider: NotesProvider) {
    const defaultName = path.basename(originalFileName, path.extname(originalFileName));
    
    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre de la nota (sin extensión)',
        value: defaultName,
        placeHolder: 'nueva-nota'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.md`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe una nota con ese nombre');
        return;
    }

    const noteContent = `# ${fileName}\n\n${content}\n`;
    fs.writeFileSync(filePath, noteContent);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Nota creada: ${fileName}.md`);
}

// Crear archivo con extensión personalizada desde contenido
async function createCustomExtensionFileFromContent(content: string, notesDir: string, notesProvider: NotesProvider) {
    const extension = await vscode.window.showInputBox({
        prompt: 'Extensión del archivo (sin punto)',
        placeHolder: 'txt',
        validateInput: (value) => {
            if (!value || !/^[a-zA-Z0-9]+$/.test(value)) {
                return 'La extensión debe contener solo letras y números';
            }
            return null;
        }
    });

    if (!extension) { return; }

    const fileName = await vscode.window.showInputBox({
        prompt: `Nombre del archivo (sin extensión .${extension})`,
        placeHolder: 'archivo'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.${extension}`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe un archivo con ese nombre');
        return;
    }

    fs.writeFileSync(filePath, content);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Archivo creado: ${fileName}.${extension}`);
}

// Función para manejar contenido pegado desde portapapeles
async function handlePasteContent(content: string, notesDir: string, notesProvider: NotesProvider) {
    // Verificar si el contenido es una imagen (base64)
    if (isImageContent(content)) {
        await handleImagePaste(content, notesDir, notesProvider);
        return;
    }

    // Verificar si el contenido parece ser una URL de imagen
    if (isImageUrl(content)) {
        await handleImageUrlPaste(content, notesDir, notesProvider);
        return;
    }

    // Es contenido de texto
    await handleTextPaste(content, notesDir, notesProvider);
}

// Detectar si es contenido de imagen en base64
function isImageContent(content: string): boolean {
    return content.startsWith('data:image/') && content.includes('base64,');
}

// Detectar si es una URL de imagen
function isImageUrl(content: string): boolean {
    try {
        const url = new URL(content.trim());
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        return imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext));
    } catch {
        return false;
    }
}

// Manejar pegado de imagen
async function handleImagePaste(content: string, notesDir: string, notesProvider: NotesProvider) {
    const options = [
        '📁 Guardar en carpeta assets',
        '📄 Crear nueva nota con imagen'
    ];

    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: '¿Dónde quieres guardar la imagen?'
    });

    if (!selection) { return; }

    try {
        if (selection.startsWith('📁')) {
            await saveImageToAssets(content, notesDir);
        } else {
            await createNoteWithImage(content, notesDir, notesProvider);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error al procesar imagen: ${error}`);
    }
}

// Manejar pegado de URL de imagen
async function handleImageUrlPaste(content: string, notesDir: string, notesProvider: NotesProvider) {
    const options = [
        '📁 Descargar a carpeta assets',
        '📄 Crear nueva nota con referencia a imagen',
        '📋 Pegar URL como texto'
    ];

    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: '¿Cómo quieres manejar esta URL de imagen?'
    });

    if (!selection) { return; }

    try {
        if (selection.startsWith('📁')) {
            await downloadImageToAssets(content.trim(), notesDir);
        } else if (selection.startsWith('📄')) {
            await createNoteWithImageUrl(content.trim(), notesDir, notesProvider);
        } else {
            // Tratar como texto normal
            await handleTextPaste(content, notesDir, notesProvider);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error al procesar URL de imagen: ${error}`);
    }
}

// Manejar pegado de texto
async function handleTextPaste(content: string, notesDir: string, notesProvider: NotesProvider) {
    const options = [
        '📝 Crear como nota Markdown (.md)',
        '🔧 Elegir extensión personalizada'
    ];

    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: '¿Cómo quieres guardar este contenido de texto?'
    });

    if (!selection) { return; }

    if (selection.startsWith('📝')) {
        await createMarkdownNote(content, notesDir, notesProvider);
    } else {
        await createCustomExtensionFile(content, notesDir, notesProvider);
    }
}

// Guardar imagen en carpeta assets
async function saveImageToAssets(base64Content: string, notesDir: string) {
    const assetsDir = path.join(notesDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre del archivo de imagen (sin extensión)',
        placeHolder: 'imagen'
    });

    if (!fileName) { return; }

    // Extraer tipo de imagen y datos
    const match = base64Content.match(/data:image\/([a-zA-Z]*);base64,(.*)$/);
    if (!match) {
        throw new Error('Formato de imagen inválido');
    }

    const [, imageType, imageData] = match;
    const filePath = path.join(assetsDir, `${fileName}.${imageType}`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe un archivo con ese nombre');
        return;
    }

    const buffer = Buffer.from(imageData, 'base64');
    fs.writeFileSync(filePath, buffer);
    
    vscode.window.showInformationMessage(`Imagen guardada: assets/${fileName}.${imageType}`);
}

// Crear nueva nota con imagen embebida
async function createNoteWithImage(base64Content: string, notesDir: string, notesProvider: NotesProvider) {
    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre de la nota (sin extensión)',
        placeHolder: 'nota-con-imagen'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.md`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe una nota con ese nombre');
        return;
    }

    const content = `# ${fileName}\n\n![Imagen](${base64Content})\n\n`;
    fs.writeFileSync(filePath, content);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Nota con imagen creada: ${fileName}.md`);
}

// Descargar imagen desde URL a assets
async function downloadImageToAssets(imageUrl: string, notesDir: string) {
    const assetsDir = path.join(notesDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre del archivo de imagen (sin extensión)',
        placeHolder: 'imagen-descargada'
    });

    if (!fileName) { return; }

    try {
        const url = new URL(imageUrl);
        const ext = path.extname(url.pathname) || '.jpg';
        const filePath = path.join(assetsDir, `${fileName}${ext}`);
        
        if (fs.existsSync(filePath)) {
            vscode.window.showErrorMessage('Ya existe un archivo con ese nombre');
            return;
        }

        // Descargar imagen usando fetch nativo de Node.js
        vscode.window.showInformationMessage('Descargando imagen...');
        
        const https = require('https');
        const http = require('http');
        const urlModule = require('url');
        
        const parsedUrl = urlModule.parse(imageUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        return new Promise<void>((resolve, reject) => {
            const request = client.get(imageUrl, (response: any) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Error al descargar: ${response.statusCode}`));
                    return;
                }
                
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });
                
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    fs.writeFileSync(filePath, buffer);
                    vscode.window.showInformationMessage(`Imagen descargada: assets/${fileName}${ext}`);
                    resolve();
                });
            });
            
            request.on('error', (error: any) => {
                reject(error);
            });
            
            request.setTimeout(10000, () => {
                request.destroy();
                reject(new Error('Timeout al descargar la imagen'));
            });
        });
        
    } catch (error) {
        vscode.window.showErrorMessage(`Error al descargar imagen: ${error}`);
    }
}

// Crear nueva nota con URL de imagen
async function createNoteWithImageUrl(imageUrl: string, notesDir: string, notesProvider: NotesProvider) {
    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre de la nota (sin extensión)',
        placeHolder: 'nota-con-imagen'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.md`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe una nota con ese nombre');
        return;
    }

    const content = `# ${fileName}\n\n![Imagen](${imageUrl})\n\n`;
    fs.writeFileSync(filePath, content);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Nota con imagen creada: ${fileName}.md`);
}

// Crear nota markdown
async function createMarkdownNote(content: string, notesDir: string, notesProvider: NotesProvider) {
    const fileName = await vscode.window.showInputBox({
        prompt: 'Nombre de la nota (sin extensión)',
        placeHolder: 'nueva-nota'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.md`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe una nota con ese nombre');
        return;
    }

    const noteContent = `# ${fileName}\n\n${content}\n`;
    fs.writeFileSync(filePath, noteContent);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Nota creada: ${fileName}.md`);
}

// Crear archivo con extensión personalizada
async function createCustomExtensionFile(content: string, notesDir: string, notesProvider: NotesProvider) {
    const extension = await vscode.window.showInputBox({
        prompt: 'Extensión del archivo (sin punto)',
        placeHolder: 'txt',
        validateInput: (value) => {
            if (!value || !/^[a-zA-Z0-9]+$/.test(value)) {
                return 'La extensión debe contener solo letras y números';
            }
            return null;
        }
    });

    if (!extension) { return; }

    const fileName = await vscode.window.showInputBox({
        prompt: `Nombre del archivo (sin extensión .${extension})`,
        placeHolder: 'archivo'
    });

    if (!fileName) { return; }

    const filePath = path.join(notesDir, `${fileName}.${extension}`);
    
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Ya existe un archivo con ese nombre');
        return;
    }

    fs.writeFileSync(filePath, content);
    notesProvider.refresh();
    
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`Archivo creado: ${fileName}.${extension}`);
}

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

// Wiki Links functionality

// Definition Provider para wiki links
class WikiLinkDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private context: vscode.ExtensionContext) {}

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const line = document.lineAt(position.line).text;
        const wikiLinkMatch = extractWikiLinkAtPosition(line, position.character);
        
        if (wikiLinkMatch) {
            const notesDir = this.context.globalState.get<string>('markdownNotes.notesDirectory');
            if (notesDir) {
                const targetPath = resolveWikiLinkPath(wikiLinkMatch, notesDir);
                
                // Si el archivo no existe, crearlo automáticamente
                if (!fs.existsSync(targetPath)) {
                    await createFileForWikiLink(targetPath, wikiLinkMatch);
                    vscode.window.showInformationMessage(`Archivo creado: ${path.basename(targetPath)}`);
                }
                
                return new vscode.Location(vscode.Uri.file(targetPath), new vscode.Position(0, 0));
            }
        }
        
        return undefined;
    }
}

// Hover Provider para wiki links
class WikiLinkHoverProvider implements vscode.HoverProvider {
    constructor(private context: vscode.ExtensionContext) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const line = document.lineAt(position.line).text;
        const wikiLinkMatch = extractWikiLinkAtPosition(line, position.character);
        
        if (wikiLinkMatch) {
            const notesDir = this.context.globalState.get<string>('markdownNotes.notesDirectory');
            if (notesDir) {
                const targetPath = resolveWikiLinkPath(wikiLinkMatch, notesDir);
                const exists = fs.existsSync(targetPath);
                
                let hoverContent = '';
                
                if (exists) {
                    // Generar preview del archivo
                    const preview = this.generateFilePreview(targetPath);
                    hoverContent = `**📄 ${path.basename(targetPath)}**\n\n---\n\n${preview}\n\n---\n\n*Cmd+Click para abrir*`;
                } else {
                    hoverContent = `**📄 ${wikiLinkMatch}**\n\n❌ *Archivo no existe*\n\n*Cmd+Click para crear y abrir*`;
                }
                
                const hoverText = new vscode.MarkdownString(hoverContent);
                hoverText.isTrusted = true;
                
                return new vscode.Hover(hoverText);
            }
        }
        
        return undefined;
    }

    private generateFilePreview(filePath: string): string {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const extension = path.extname(filePath).toLowerCase();
            
            // Determinar cómo mostrar el preview según el tipo de archivo
            switch (extension) {
                case '.md':
                    return this.previewMarkdown(content);
                case '.txt':
                    return this.previewText(content);
                case '.json':
                    return this.previewJson(content);
                case '.js':
                case '.ts':
                case '.py':
                case '.css':
                case '.html':
                    return this.previewCode(content, extension);
                default:
                    return this.previewText(content);
            }
        } catch (error) {
            return '❌ *Error al leer el archivo*';
        }
    }

    private previewMarkdown(content: string): string {
        const lines = content.split('\n');
        const previewLines = lines.slice(0, 10); // Máximo 10 líneas
        
        let preview = previewLines.join('\n').trim();
        
        // Si hay más contenido, agregar indicador
        if (lines.length > 10) {
            preview += '\n\n*...más contenido...*';
        }
        
        // Si está vacío
        if (!preview.trim()) {
            preview = '*Archivo vacío*';
        }
        
        return preview;
    }

    private previewText(content: string): string {
        const lines = content.split('\n');
        const previewLines = lines.slice(0, 8); // Menos líneas para texto plano
        
        let preview = previewLines.map(line => line.trim()).join('\n').trim();
        
        if (lines.length > 8) {
            preview += '\n\n*...más contenido...*';
        }
        
        if (!preview.trim()) {
            preview = '*Archivo vacío*';
        }
        
        return '```\n' + preview + '\n```';
    }

    private previewJson(content: string): string {
        try {
            const parsed = JSON.parse(content);
            const formatted = JSON.stringify(parsed, null, 2);
            const lines = formatted.split('\n');
            
            let preview = lines.slice(0, 15).join('\n');
            
            if (lines.length > 15) {
                preview += '\n  ...más propiedades...';
            }
            
            return '```json\n' + preview + '\n```';
        } catch {
            return this.previewText(content);
        }
    }

    private previewCode(content: string, extension: string): string {
        const language = extension.substring(1); // Remover el punto
        const lines = content.split('\n');
        const previewLines = lines.slice(0, 12);
        
        let preview = previewLines.join('\n').trim();
        
        if (lines.length > 12) {
            preview += '\n// ...más código...';
        }
        
        if (!preview.trim()) {
            preview = '// Archivo vacío';
        }
        
        return '```' + language + '\n' + preview + '\n```';
    }
}

// Document Link Provider para hacer los wiki-links clicables
class WikiLinkDocumentLinkProvider implements vscode.DocumentLinkProvider {

    provideDocumentLinks(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.DocumentLink[] | undefined {
        const links: vscode.DocumentLink[] = [];
        const regex = /\[\[([^\]]+)\]\]/g;
        const text = document.getText();
        let match;

        while ((match = regex.exec(text)) !== null) {
            const linkText = match[1].trim().replace(/\s+/g, ' ');
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);

            // Usar comando para navegación en lugar de URI personalizado
            const uri = vscode.Uri.parse(`command:markdownNotes.navigateToWikiLinkFromClick?${encodeURIComponent(JSON.stringify({ linkText, sourceUri: document.uri.toString() }))}`);
            const documentLink = new vscode.DocumentLink(range, uri);
            documentLink.tooltip = `Ir a: ${linkText}`;
            
            links.push(documentLink);
        }

        return links;
    }

    resolveDocumentLink(
        link: vscode.DocumentLink,
        _token: vscode.CancellationToken
    ): vscode.DocumentLink | undefined {
        return link;
    }
}

// Extraer wiki link en una posición específica
function extractWikiLinkAtPosition(line: string, characterPosition: number): string | null {
    const regex = /\[\[([^\]]+)\]\]/g;
    let match;
    
    while ((match = regex.exec(line)) !== null) {
        const startPos = match.index;
        const endPos = match.index + match[0].length;
        
        if (characterPosition >= startPos && characterPosition <= endPos) {
            // Normalizar espacios y limpiar el texto
            return match[1].trim().replace(/\s+/g, ' ');
        }
    }
    
    return null;
}

// Resolver la ruta del archivo para un wiki link
function resolveWikiLinkPath(linkText: string, notesDir: string): string {
    // Normalizar espacios
    const normalizedLink = linkText.trim().replace(/\s+/g, ' ');
    
    // Si ya tiene extensión, úsala; sino, usar .md por defecto
    const hasExtension = path.extname(normalizedLink) !== '';
    const fileName = hasExtension ? normalizedLink : `${normalizedLink}.md`;
    
    // Buscar el archivo en el directorio de notas y subdirectorios
    const foundPath = findFileInDirectory(notesDir, fileName);
    if (foundPath) {
        return foundPath;
    }
    
    // Si no se encuentra, retornar la ruta en el directorio raíz
    return path.join(notesDir, fileName);
}

// Buscar archivo recursivamente en un directorio
function findFileInDirectory(dir: string, fileName: string): string | null {
    if (!fs.existsSync(dir)) {
        return null;
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isFile() && entry.name === fileName) {
            return fullPath;
        }
        
        if (entry.isDirectory()) {
            const found = findFileInDirectory(fullPath, fileName);
            if (found) {
                return found;
            }
        }
    }
    
    return null;
}

// Navegar a un wiki link
async function navigateToWikiLink(linkText: string, context: vscode.ExtensionContext, notesProvider: NotesProvider) {
    const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
    if (!notesDir) {
        vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
        return;
    }
    
    const targetPath = resolveWikiLinkPath(linkText, notesDir);
    
    // Si el archivo no existe, crearlo automáticamente
    if (!fs.existsSync(targetPath)) {
        await createFileForWikiLink(targetPath, linkText);
        notesProvider.refresh();
        vscode.window.showInformationMessage(`Archivo creado: ${path.basename(targetPath)}`);
    }
    
    // Abrir el archivo
    const doc = await vscode.workspace.openTextDocument(targetPath);
    await vscode.window.showTextDocument(doc);
}

// Navegar a wiki link creando archivo al mismo nivel del archivo actual
async function navigateToWikiLinkRelative(linkText: string, sourceUri: string, context: vscode.ExtensionContext, notesProvider: NotesProvider) {
    const notesDir = context.globalState.get<string>('markdownNotes.notesDirectory');
    if (!notesDir) {
        vscode.window.showWarningMessage('Por favor, selecciona un directorio de notas primero');
        return;
    }

    // Obtener el directorio del archivo actual
    const sourceFileUri = vscode.Uri.parse(sourceUri);
    const currentFileDir = path.dirname(sourceFileUri.fsPath);
    
    // Normalizar el texto del enlace
    const normalizedLink = linkText.trim().replace(/\s+/g, ' ');
    
    // Determinar la extensión
    const hasExtension = path.extname(normalizedLink) !== '';
    const fileName = hasExtension ? normalizedLink : `${normalizedLink}.md`;
    
    // Crear la ruta al mismo nivel que el archivo actual
    const targetPath = path.join(currentFileDir, fileName);
    
    // Si el archivo no existe, crearlo automáticamente
    if (!fs.existsSync(targetPath)) {
        await createFileForWikiLink(targetPath, linkText);
        notesProvider.refresh();
        vscode.window.showInformationMessage(`Archivo creado: ${path.basename(targetPath)}`);
    }
    
    // Abrir el archivo
    const doc = await vscode.workspace.openTextDocument(targetPath);
    await vscode.window.showTextDocument(doc);
}

// Crear archivo para wiki link
async function createFileForWikiLink(filePath: string, _linkText: string) {
    const dir = path.dirname(filePath);
    
    // Crear directorio si no existe
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Determinar contenido inicial según la extensión
    let content = '';
    const extension = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, extension);
    
    switch (extension) {
        case '.md':
            content = `# ${baseName}\n\n`;
            break;
        case '.txt':
            content = `${baseName}\n${'='.repeat(baseName.length)}\n\n`;
            break;
        case '.js':
            content = `// ${baseName}\n\n`;
            break;
        case '.ts':
            content = `// ${baseName}\n\n`;
            break;
        case '.py':
            content = `# ${baseName}\n\n`;
            break;
        case '.html':
            content = `<!DOCTYPE html>\n<html>\n<head>\n    <title>${baseName}</title>\n</head>\n<body>\n    \n</body>\n</html>\n`;
            break;
        case '.css':
            content = `/* ${baseName} */\n\n`;
            break;
        case '.json':
            content = `{\n    \n}\n`;
            break;
        default:
            content = '';
    }
    
    fs.writeFileSync(filePath, content);
}

// Graph View functionality

class GraphViewPanel {
    public static currentPanel: GraphViewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _notesDir: string = '';

    public static createOrShow(extensionUri: vscode.Uri, notesDir: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Si ya tenemos un panel, mostrarlo
        if (GraphViewPanel.currentPanel) {
            GraphViewPanel.currentPanel._panel.reveal(column);
            GraphViewPanel.currentPanel._update(notesDir);
            return;
        }

        // Crear nuevo panel
        const panel = vscode.window.createWebviewPanel(
            'markdownGraphView',
            'Vista de Grafo',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        GraphViewPanel.currentPanel = new GraphViewPanel(panel, extensionUri);
        GraphViewPanel.currentPanel._update(notesDir);
    }

    private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
        this._panel = panel;

        // Configurar el contenido inicial
        this._panel.webview.html = this._getHtmlForWebview();

        // Escuchar cuando el panel se dispone
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Manejar mensajes del webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'openFile':
                        this._openFile(message.filePath);
                        return;
                    case 'requestGraphData':
                        this._refreshGraphData();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _openFile(filePath: string) {
        if (fs.existsSync(filePath)) {
            // Para imágenes y otros archivos binarios, usar el comando de VS Code para abrirlos
            const extension = path.extname(filePath).toLowerCase();
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
            const documentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
            
            if (imageExtensions.includes(extension) || documentExtensions.includes(extension)) {
                // Abrir con el programa predeterminado del sistema
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            } else {
                // Para archivos de texto, abrir en el editor
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc);
            }
        } else {
            // Solo crear automáticamente si es un archivo de texto/markdown
            const extension = path.extname(filePath).toLowerCase();
            if (extension === '.md' || extension === '.txt' || extension === '') {
                const createdFilePath = await this._createFileForPath(filePath);
                // Actualizar el grafo después de crear el archivo
                this._panel.webview.postMessage({
                    command: 'refreshGraph'
                });
                // Abrir el archivo recién creado
                const doc = await vscode.workspace.openTextDocument(createdFilePath);
                await vscode.window.showTextDocument(doc);
            } else {
                // Para otros tipos de archivo, mostrar mensaje
                vscode.window.showWarningMessage(`El archivo no existe: ${path.basename(filePath)}`);
            }
        }
    }

    private async _createFileForPath(filePath: string) {
        const dir = path.dirname(filePath);
        
        // Crear directorio si no existe
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Si no tiene extensión, agregar .md por defecto
        let finalFilePath = filePath;
        if (!path.extname(filePath)) {
            finalFilePath = `${filePath}.md`;
        }
        
        // Determinar contenido inicial según la extensión
        let content = '';
        const extension = path.extname(finalFilePath).toLowerCase();
        const baseName = path.basename(finalFilePath, extension);
        
        switch (extension) {
            case '.md':
                content = `# ${baseName}\n\n`;
                break;
            case '.txt':
                content = `${baseName}\n${'='.repeat(baseName.length)}\n\n`;
                break;
            case '.js':
                content = `// ${baseName}\n\n`;
                break;
            case '.ts':
                content = `// ${baseName}\n\n`;
                break;
            case '.py':
                content = `# ${baseName}\n\n`;
                break;
            case '.html':
                content = `<!DOCTYPE html>\n<html>\n<head>\n    <title>${baseName}</title>\n</head>\n<body>\n    \n</body>\n</html>\n`;
                break;
            case '.css':
                content = `/* ${baseName} */\n\n`;
                break;
            case '.json':
                content = `{\n    \n}\n`;
                break;
            default:
                content = '';
        }
        
        fs.writeFileSync(finalFilePath, content);
        
        // Devolver la ruta final para que el caller pueda usarla
        return finalFilePath;
    }

    private _update(notesDir: string) {
        this._notesDir = notesDir;
        const graphData = this._generateGraphData(notesDir);
        this._panel.webview.postMessage({
            command: 'updateGraph',
            data: graphData
        });
    }

    private _refreshGraphData() {
        if (this._notesDir) {
            this._update(this._notesDir);
        }
    }

    public refreshGraph() {
        this._refreshGraphData();
    }

    private _generateGraphData(notesDir: string) {
        const nodes: any[] = [];
        const links: any[] = [];
        const nodeMap = new Map<string, number>();
        let nodeIndex = 0;

        // Función recursiva para procesar archivos
        const processDirectory = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    processDirectory(fullPath);
                } else if (this._shouldIncludeFile(entry.name)) {
                    // Agregar nodo
                    const relativePath = path.relative(notesDir, fullPath);
                    const nodeId = nodeIndex++;
                    nodeMap.set(fullPath, nodeId);
                    
                    nodes.push({
                        id: nodeId,
                        name: path.basename(fullPath),
                        path: fullPath,
                        relativePath: relativePath,
                        type: this._getFileType(entry.name)
                    });
                }
            }
        };

        // Procesar todos los archivos primero
        processDirectory(notesDir);

        // Buscar enlaces entre archivos
        for (const [filePath, nodeId] of nodeMap) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const wikiLinks = this._extractWikiLinks(content);
                
                for (const linkText of wikiLinks) {
                    const targetPath = this._resolveWikiLinkPath(linkText, notesDir);
                    const targetNodeId = nodeMap.get(targetPath);
                    
                    if (targetNodeId !== undefined && targetNodeId !== nodeId) {
                        links.push({
                            source: nodeId,
                            target: targetNodeId,
                            linkText: linkText
                        });
                    }
                }
            } catch (error) {
                // Ignorar errores de lectura de archivos
            }
        }

        return { nodes, links };
    }

    private _shouldIncludeFile(fileName: string): boolean {
        // Incluir todos los archivos excepto archivos ocultos del sistema
        return !fileName.startsWith('.') || fileName === '.gitignore';
    }

    private _getFileType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        switch (ext) {
            case '.md': return 'markdown';
            case '.txt': return 'text';
            case '.js': return 'javascript';
            case '.ts': return 'typescript';
            case '.py': return 'python';
            case '.html': return 'html';
            case '.css': return 'css';
            case '.json': return 'json';
            case '.xml': return 'xml';
            case '.yaml':
            case '.yml': return 'yaml';
            // Imágenes
            case '.png':
            case '.jpg':
            case '.jpeg':
            case '.gif':
            case '.svg':
            case '.bmp':
            case '.ico':
            case '.webp': return 'image';
            // Videos
            case '.mp4':
            case '.avi':
            case '.mov':
            case '.mkv':
            case '.webm': return 'video';
            // Audio
            case '.mp3':
            case '.wav':
            case '.ogg':
            case '.m4a': return 'audio';
            // Documentos
            case '.pdf': return 'pdf';
            case '.doc':
            case '.docx': return 'document';
            case '.xls':
            case '.xlsx': return 'spreadsheet';
            case '.ppt':
            case '.pptx': return 'presentation';
            // Archivos comprimidos
            case '.zip':
            case '.rar':
            case '.7z':
            case '.tar':
            case '.gz': return 'archive';
            // Configuración
            case '.ini':
            case '.conf':
            case '.cfg': return 'config';
            case '.log': return 'log';
            // Otros
            default: return 'file';
        }
    }

    private _extractWikiLinks(content: string): string[] {
        const links: string[] = [];
        
        // Extraer wiki links [[texto]]
        const wikiRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        
        while ((match = wikiRegex.exec(content)) !== null) {
            // Normalizar espacios y limpiar el texto
            const cleanLink = match[1].trim().replace(/\s+/g, ' ');
            if (cleanLink && !links.includes(cleanLink)) {
                links.push(cleanLink);
            }
        }
        
        // Extraer referencias a imágenes ![alt](path)
        const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
        
        while ((match = imageRegex.exec(content)) !== null) {
            let imagePath = match[1].trim();
            // Decodificar URL en caso de que tenga espacios codificados
            try {
                imagePath = decodeURIComponent(imagePath);
            } catch (e) {
                // Si falla la decodificación, usar el path original
            }
            if (imagePath && !links.includes(imagePath)) {
                links.push(imagePath);
            }
        }
        
        // Extraer enlaces markdown normales [texto](path) que no sean URLs
        const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
        
        while ((match = linkRegex.exec(content)) !== null) {
            let linkPath = match[2].trim();
            // Decodificar URL en caso de que tenga espacios codificados
            try {
                linkPath = decodeURIComponent(linkPath);
            } catch (e) {
                // Si falla la decodificación, usar el path original
            }
            // Solo incluir si no es una URL (no empieza con http/https)
            if (linkPath && !linkPath.startsWith('http') && !linkPath.startsWith('https') && !links.includes(linkPath)) {
                links.push(linkPath);
            }
        }
        
        return links;
    }

    private _resolveWikiLinkPath(linkText: string, notesDir: string): string {
        // Normalizar espacios
        const normalizedLink = linkText.trim().replace(/\s+/g, ' ');
        
        // Si es una ruta relativa que empieza con ./  o ../  o contiene /, mantenerla tal como está
        if (normalizedLink.includes('/')) {
            // Resolver ruta relativa respecto al directorio de notas
            const resolvedPath = path.resolve(notesDir, normalizedLink);
            return resolvedPath;
        }
        
        const hasExtension = path.extname(normalizedLink) !== '';
        const fileName = hasExtension ? normalizedLink : `${normalizedLink}.md`;
        
        const foundPath = this._findFileInDirectory(notesDir, fileName);
        return foundPath || path.join(notesDir, fileName);
    }

    private _findFileInDirectory(dir: string, fileName: string): string | null {
        if (!fs.existsSync(dir)) return null;
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isFile() && entry.name === fileName) {
                return fullPath;
            }
            
            if (entry.isDirectory()) {
                const found = this._findFileInDirectory(fullPath, fileName);
                if (found) return found;
            }
        }
        
        return null;
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vista de Grafo</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
        }
        
        #graph {
            width: 100vw;
            height: 100vh;
        }
        
        .node {
            cursor: pointer;
        }
        
        .node circle {
            stroke: var(--vscode-editor-foreground);
            stroke-width: 2px;
        }
        
        .node.markdown circle { fill: #ff6b6b; }
        .node.text circle { fill: #4ecdc4; }
        .node.javascript circle { fill: #ffe66d; }
        .node.typescript circle { fill: #4dabf7; }
        .node.python circle { fill: #69db7c; }
        .node.html circle { fill: #ff8cc8; }
        .node.css circle { fill: #91a7ff; }
        .node.json circle { fill: #ffa94d; }
        .node.xml circle { fill: #ff9f43; }
        .node.yaml circle { fill: #a55eea; }
        
        /* Assets */
        .node.image circle { fill: #26de81; }
        .node.video circle { fill: #fd79a8; }
        .node.audio circle { fill: #fdcb6e; }
        .node.pdf circle { fill: #e84393; }
        .node.document circle { fill: #74b9ff; }
        .node.spreadsheet circle { fill: #00b894; }
        .node.presentation circle { fill: #e17055; }
        .node.archive circle { fill: #636e72; }
        .node.config circle { fill: #dda0dd; }
        .node.log circle { fill: #95a5a6; }
        
        .node.file circle { fill: var(--vscode-editor-foreground); }
        
        .node text {
            font: 12px sans-serif;
            text-anchor: middle;
            fill: var(--vscode-editor-foreground);
            dominant-baseline: central;
        }
        
        .link {
            stroke: var(--vscode-editor-foreground);
            stroke-opacity: 0.6;
            stroke-width: 1.5px;
        }
        
        .info {
            position: absolute;
            top: 10px;
            right: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            padding: 10px;
            max-width: 300px;
        }
    </style>
</head>
<body>
    <div class="info" id="info" style="display: none;">
        <div id="infoContent"></div>
    </div>
    
    <svg id="graph"></svg>

    <script>
        const vscode = acquireVsCodeApi();
        let graphData = { nodes: [], links: [] };

        const svg = d3.select("#graph");
        const width = window.innerWidth;
        const height = window.innerHeight;

        svg.attr("width", width).attr("height", height);

        const simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(30));

        let link, node;

        function updateGraph(data) {
            graphData = data;
            
            // Limpiar elementos existentes
            svg.selectAll("*").remove();
            
            // Crear grupos
            const g = svg.append("g");
            
            // Zoom
            const zoom = d3.zoom()
                .scaleExtent([0.1, 10])
                .on("zoom", (event) => {
                    g.attr("transform", event.transform);
                });
            
            svg.call(zoom);

            // Enlaces
            link = g.append("g")
                .selectAll("line")
                .data(data.links)
                .enter().append("line")
                .attr("class", "link");

            // Nodos
            node = g.append("g")
                .selectAll("g")
                .data(data.nodes)
                .enter().append("g")
                .attr("class", d => \`node \${d.type}\`)
                .call(d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended))
                .on("click", (event, d) => {
                    vscode.postMessage({
                        command: 'openFile',
                        filePath: d.path
                    });
                })
                .on("mouseover", (event, d) => {
                    showInfo(d);
                })
                .on("mouseout", hideInfo);

            // Círculos de nodos
            node.append("circle")
                .attr("r", 20);

            // Texto de nodos
            node.append("text")
                .text(d => d.name.length > 15 ? d.name.substring(0, 12) + "..." : d.name);

            // Actualizar simulación
            simulation
                .nodes(data.nodes)
                .on("tick", ticked);

            simulation.force("link")
                .links(data.links);

            simulation.alpha(1).restart();
        }

        function ticked() {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("transform", d => \`translate(\${d.x},\${d.y})\`);
        }

        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        function showInfo(d) {
            const info = document.getElementById('info');
            const content = document.getElementById('infoContent');
            content.innerHTML = \`
                <strong>\${d.name}</strong><br>
                <small>\${d.relativePath}</small><br>
                <small>Tipo: \${d.type}</small>
            \`;
            info.style.display = 'block';
        }

        function hideInfo() {
            document.getElementById('info').style.display = 'none';
        }

        // Escuchar mensajes desde la extensión
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateGraph':
                    updateGraph(message.data);
                    break;
                case 'refreshGraph':
                    // Solicitar datos actualizados del grafo
                    vscode.postMessage({
                        command: 'requestGraphData'
                    });
                    break;
            }
        });

        // Ajustar tamaño en resize
        window.addEventListener('resize', () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            svg.attr("width", newWidth).attr("height", newHeight);
            simulation.force("center", d3.forceCenter(newWidth / 2, newHeight / 2));
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        GraphViewPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

// Wiki Link Completion Provider
class WikiLinkCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private context: vscode.ExtensionContext) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        
        // Verificar si estamos dentro de una sintaxis de wiki link
        if (linePrefix.endsWith('[[') || linePrefix.match(/\[\[[^\]]*$/)) {
            const notesDir = this.context.globalState.get<string>('markdownNotes.notesDirectory');
            if (!notesDir) {
                return [];
            }

            return this._getAllFiles(notesDir).map(fileInfo => {
                const item = new vscode.CompletionItem(fileInfo.label, vscode.CompletionItemKind.File);
                item.insertText = fileInfo.insertText;
                item.detail = fileInfo.path;
                item.documentation = `Archivo: ${fileInfo.type}`;
                
                // Configurar el rango de reemplazo para incluir los [[ si es necesario
                const line = document.lineAt(position);
                const beforeCursor = line.text.substring(0, position.character);
                const afterCursor = line.text.substring(position.character);
                
                // Si ya está dentro de [[]], solo insertamos el nombre
                if (beforeCursor.includes('[[')) {
                    const startIndex = beforeCursor.lastIndexOf('[[') + 2;
                    const endIndex = afterCursor.indexOf(']]') !== -1 ? 
                                   position.character + afterCursor.indexOf(']]') : 
                                   position.character;
                    
                    item.range = new vscode.Range(
                        position.line, 
                        startIndex,
                        position.line, 
                        endIndex
                    );
                    item.insertText = fileInfo.insertText;
                } else {
                    // Si no está dentro de [[]], insertamos [[nombre]]
                    item.insertText = `[[${fileInfo.insertText}]]`;
                }
                
                return item;
            });
        }

        return [];
    }

    private _getAllFiles(dir: string): Array<{label: string, insertText: string, path: string, type: string}> {
        const files: Array<{label: string, insertText: string, path: string, type: string}> = [];
        
        const scanDirectory = (currentDir: string, _basePath: string = '') => {
            try {
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    const relativePath = path.relative(dir, fullPath);
                    
                    if (entry.isFile()) {
                        const ext = path.extname(entry.name);
                        const nameWithoutExt = path.basename(entry.name, ext);
                        
                        // Para archivos markdown, usar solo el nombre sin extensión
                        // Para otros archivos, usar el nombre completo o la ruta relativa
                        let insertText = '';
                        let label = '';
                        
                        if (ext === '.md') {
                            insertText = nameWithoutExt;
                            label = nameWithoutExt;
                        } else if (relativePath.includes('/')) {
                            insertText = relativePath;
                            label = relativePath;
                        } else {
                            insertText = entry.name;
                            label = entry.name;
                        }
                        
                        files.push({
                            label: label,
                            insertText: insertText,
                            path: relativePath,
                            type: this._getFileTypeDescription(ext)
                        });
                        
                    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        scanDirectory(fullPath, relativePath);
                    }
                }
            } catch (error) {
                console.log('Error scanning directory:', error);
            }
        };
        
        scanDirectory(dir);
        return files.sort((a, b) => a.label.localeCompare(b.label));
    }

    private _getFileTypeDescription(ext: string): string {
        switch (ext.toLowerCase()) {
            case '.md': return 'Markdown';
            case '.txt': return 'Texto';
            case '.png':
            case '.jpg':
            case '.jpeg':
            case '.gif':
            case '.svg': return 'Imagen';
            case '.pdf': return 'PDF';
            case '.json': return 'JSON';
            case '.js': return 'JavaScript';
            case '.ts': return 'TypeScript';
            case '.css': return 'CSS';
            case '.html': return 'HTML';
            default: return 'Archivo';
        }
    }
}