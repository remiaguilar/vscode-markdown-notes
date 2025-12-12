# Markdown Notes

**Gestor completo de notas markdown con encriptación, wiki-links y visualización de grafos** 

Una extensión poderosa para VS Code que transforma tu experiencia de toma de notas con funcionalidades avanzadas de gestión, encriptación y navegación tipo Obsidian.

## ✨ Características Principales

### 📁 **Gestión de Archivos Inteligente**
- **Creación universal**: Crea cualquier tipo de archivo (`.md`, `.txt`, `.js`, `.py`, etc.) con extensión automática
- **Explorador optimizado**: Vista de árbol limpia con drag & drop
- **Menú unificado**: Botón "+" desplegable para crear archivos o carpetas
- **Organización ilimitada**: Carpetas y subcarpetas sin límite

### 🔗 **Wiki-Links Avanzados**
- **Sintaxis [[nombre-archivo]]**: Enlaces tipo Obsidian
- **Auto-completado inteligente**: Sugerencias mientras escribes
- **Navegación rápida**: `F12` o `Ctrl+Click` para seguir enlaces
- **Creación automática**: Archivos se crean al hacer clic en enlaces inexistentes
- **Vista previa**: Hover para ver contenido sin abrir

### 📊 **Visualización de Grafos**
- **Red interactiva**: Mapa visual de todas tus notas conectadas
- **Nodos dinámicos**: Tamaño basado en número de conexiones
- **Navegación por clic**: Abre archivos directamente desde el grafo
- **Detección inteligente**: Incluye imágenes y referencias de archivos
- **Vista Obsidian-style**: Experiencia familiar y potente

### 🔒 **Encriptación Militar**
- **Algoritmo AES-256**: Seguridad de nivel militar
- **Protección por contraseña**: Cada archivo puede tener su propia clave
- **Estados visuales**: Iconos 🔒 (protegida), 🔓 (desbloqueada), 📝 (normal)
- **Auto-reencriptación**: Se encripta automáticamente al guardar
- **Sesión persistente**: Una vez desbloqueada, permanece accesible

### 📋 **Gestión Avanzada**
- **Copiar/Duplicar**: Duplica archivos o carpetas completas
- **Mover inteligente**: Arrastra entre carpetas o usa comando "Mover a..."
- **Integración sistema**: "Ir al Directorio" abre en Finder/Explorer
- **Drag & Drop**: Desde sistema o explorador VS Code

## 🎮 **Controles e Interfaz**

### **Barra Principal**
- ➕ **Crear Nuevo** (desplegable):
  - 📄 Crear Archivo
  - 📁 Crear Carpeta
- 🔄 **Refrescar**
- 📊 **Vista de Grafo**

### **Menú Tres Puntos (⋯)**
- 📁 **Configurar Directorio**
- 📋 **Colapsar Todo**

### **Menú Contextual (Click Derecho)**
- **Gestión**: Renombrar, Eliminar, Mover a...
- **Seguridad**: Proteger, Desbloquear, Bloquear
- **Productividad**: Copiar, Duplicar, Pegar
- **Sistema**: Ir al Directorio

## ⌨️ **Atajos de Teclado**

| Acción | Windows/Linux | Mac | Contexto |
|--------|---------------|-----|----------|
| Seguir Wiki-Link | `F12` | `F12` | Editor markdown |
| Navegación rápida | `Ctrl+Click` | `Cmd+Click` | Sobre [[link]] |
| Pegar contenido | `Ctrl+V` | `Cmd+V` | Vista de notas |

## 🚀 **Instalación**

1. Abre VS Code
2. Ve a Extensiones (`Ctrl+Shift+X`)
3. Busca "Markdown Notes"
4. Haz clic en "Instalar"
5. ¡Listo para usar!

## 📖 **Uso Rápido**

### Configuración Inicial
1. Abre la vista "Markdown Notes" en la barra lateral
2. Haz clic en los tres puntos (⋯) → "Configurar Directorio"
3. Selecciona tu carpeta de notas

### Crear y Conectar Notas
1. Usa el botón ➕ para crear archivos
2. Escribe wiki-links: `[[nombre-de-nota]]`
3. Usa auto-completado con `Ctrl+Space`
4. Navega con `F12` o `Ctrl+Click`

### Visualizar Red de Notas
1. Haz clic en 📊 "Vista de Grafo"
2. Explora las conexiones visualmente
3. Haz clic en nodos para abrir archivos

### Proteger Información Sensible
1. Click derecho en archivo → "Proteger con Contraseña"
2. Ingresa contraseña segura
3. El archivo se encripta automáticamente

## 🛠️ **Tecnología**

- **Motor**: TypeScript + VS Code API
- **Visualización**: D3.js para grafos interactivos
- **Encriptación**: AES-256-GCM con crypto nativo
- **Compatibilidad**: VS Code 1.85.0+

## 📈 **Casos de Uso**

- **Investigadores**: Red de conocimiento interconectado
- **Escritores**: Gestión de proyectos con enlaces
- **Desarrolladores**: Documentación técnica organizada  
- **Estudiantes**: Notas de clase conectadas
- **Profesionales**: Base de conocimiento empresarial
- **Personal**: Diario y notas privadas encriptadas

## 🔧 **Configuración Avanzada**

La extensión funciona sin configuración, pero puedes personalizar:

- **Directorio de trabajo**: Configurable desde la interfaz
- **Vista de grafo**: Se puede ocultar desde configuración VS Code
- **Auto-completado**: Habilitado por defecto para archivos markdown

## 🤝 **Contribuciones**

Este proyecto es open source. Contribuciones, issues y sugerencias son bienvenidas.

- **Reportar bugs**: [Issues](https://github.com/remiaguilar/vs-notes/issues)
- **Solicitar funciones**: [Feature Requests](https://github.com/remiaguilar/vs-notes/issues)
- **Contribuir código**: Fork + Pull Request

## 👨‍💻 **Autor**

**Remi Aguilar**
- Website: [remiaguilar.com](https://remiaguilar.com)
- GitHub: [@remiaguilar](https://github.com/remiaguilar)

## 📄 **Licencia**

MIT License - Ver [LICENSE](LICENSE) para más detalles.

---

**⭐ Si te gusta esta extensión, deja una estrella en GitHub y compártela con otros!**
