# Gastos Mensuales

Webapp personal para registrar gastos rápido desde iPhone, con gastos fijos mensuales, reportes, CSV y backup local.

## App publicada

https://fedewolff.github.io/gastos-mensuales/

## Correr local

```bash
npm run serve
```

Abrí `http://localhost:5173` en el navegador.

## Instalar en iPhone

1. Publicá esta carpeta como sitio estático, por ejemplo con GitHub Pages, Netlify, Vercel o Cloudflare Pages.
2. Abrí la URL desde Safari en iPhone.
3. Tocá Compartir.
4. Elegí “Agregar a pantalla de inicio”.

La app guarda datos en el navegador del iPhone. Usá `Configuración > Backup local JSON` para guardar una copia completa.

## Scripts

```bash
npm test
npm run serve
```

## Importar CSV

El CSV debe tener estas columnas en este orden:

```csv
Nombre,Categoria,Fecha,Monto
Supermercado,Comida,19/6/2026,89000
```

La fecha debe estar en formato `día/mes/año`, por ejemplo `1/3/2026`. Los importados entran como gastos variables.

El monto puede venir como `5500`, `5,500.00` o `5.500,00`. Si el CSV trae columnas extra después de `Monto`, se ignoran. Las filas con monto `0` se saltean.

Si importaste mal un CSV, usá `Configuración > Borrar gastos variables` y volvé a importarlo.
