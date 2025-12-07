# Markdown Notes

Gestor de notas markdown con encriptación.

## Funcionalidad

**Vista: Notas**
- Explorador de archivos `.md`
- Organización en carpetas ilimitadas
- Drag & Drop para mover notas
- Iconos: 🔒 (protegida), 🔓 (desbloqueada), 📝 (normal)

**Encriptación**
- Proteger nota con contraseña (AES-256)
- Desbloquear persiste en sesión
- Auto-reencriptación al guardar
- Icono 🔒 en nota protegida

## Comandos

**Vista:**
- **Select Directory** - Elegir carpeta de notas
- **Create Note** - Nueva nota (icon: `+`)
- **Create Folder** - Nueva carpeta (icon: `+`)
- **Refresh** - Refrescar vista (icon: `↻`)

**Contexto (click derecho):**
- **Renombrar** - Cambiar nombre (icon: `✏`)
- **Proteger** - Encriptar con contraseña (icon: `🔒`)
- **Desbloquear** - Ingresar contraseña (icon: `🔓`)
- **Bloquear** - Re-encriptar (icon: `🔒`)
- **Mover a...** - Cambiar de carpeta
- **Eliminar** - Borrar nota/carpeta (icon: `🗑`)

## Drag & Drop

- Arrastra notas entre carpetas
- Arrastra archivos del sistema → copia
- Arrastra desde explorador VS Code → mueve

## Autor

**Remi Aguilar**
- Website: [remiaguilar.com](https://remiaguilar.com)
- GitHub: [@remiaguilar](https://github.com/remiaguilar)

## Licencia

MIT License - Ver [LICENSE](LICENSE) para más detalles.

## Contribuciones

Este proyecto es open source. Contribuciones, issues y sugerencias son bienvenidas.

Si encuentras un bug o tienes una idea para mejorar la extensión, por favor abre un [issue](https://github.com/remiaguilar/vs-notes/issues).
