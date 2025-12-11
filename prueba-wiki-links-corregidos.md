# Prueba de Wiki-Links Corregidos

## ✅ Problemas solucionados:

### 1. URI Handler corregido
Ya no verás el error "Unable to resolve resource markdown-notes://wiki-link/..."

### 2. Creación al mismo nivel
Los archivos nuevos se crean **al mismo nivel** que esta nota, no en el directorio raíz.

## Prueba estos enlaces:

- [[nota al mismo nivel]]
- [[archivo importante aquí]]
- [[config local.json]]
- [[sdkasdjaskd]]

## Cómo funciona ahora:

### ✅ Cmd+Click (macOS):
1. Mantén **Cmd** presionado
2. Haz **clic** en cualquier `[[enlace]]`
3. Se crea automáticamente **en este mismo directorio**
4. Se abre inmediatamente

### ✅ F12:
1. Posiciona cursor sobre `[[enlace]]`
2. Presiona **F12**
3. Se crea automáticamente **en este mismo directorio**
4. Se abre inmediatamente

### ✅ Estructura de archivos:
```
📁 Tu directorio actual/
  ├── prueba-wiki-links-corregidos.md (este archivo)
  ├── nota-al-mismo-nivel.md (se creará aquí)
  ├── archivo-importante-aquí.md (se creará aquí)
  └── config-local.json (se creará aquí)
```

¡Ahora todo funciona perfectamente sin errores!