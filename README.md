# Calculadora de notas USAT

App Next + Electron para iniciar sesion en USAT, leer calificaciones, descargar silabos y simular la nota minima necesaria para aprobar con 13.50.

## Seguridad

- La contrasena USAT no se sube a Firebase ni a GitHub.
- La pagina publica de GitHub no puede leer el campus por restricciones del navegador.
- El EXE ejecuta la automatizacion localmente y usa los datos locales de `D:\Estadistica Inferencial\data`.

## Desarrollo

```powershell
npm install
npm run start:electron
```

## Build EXE

```powershell
npm run build:exe
```

El ejecutable portable queda en `dist\CalculadoraNotasUSAT-Premium.exe`.

## Firebase opcional

Copia `.env.example` a `.env.local` y completa:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

La integracion solo guarda un resumen de sesion y conteo de cursos. No guarda contrasenas.
