---
name: OMNIA Craft 2.0
description: Sistema operativo visual sobrio, dark-first y orientado a autoridad verificable.
colors:
  omnia-purple: "#56167d"
  omnia-blue: "#005b85"
  omnia-crimson: "#c8003b"
  omnia-yellow: "#fcbf4a"
  omnia-white: "#fdfdfc"
  omnia-black: "#161616"
  surface: "#ffffff"
  surface-soft: "#f7f6f8"
  surface-dark: "#1d1d1d"
  text-soft: "#414141"
  text-muted: "#666666"
  text-inverse-muted: "#c8c8c8"
  error-text: "#800026"
typography:
  display:
    fontFamily: "Lexend, Arial, sans-serif"
    fontSize: "clamp(2.35rem, 5vw, 4.75rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Lexend, Arial, sans-serif"
    fontSize: "clamp(2.5rem, 7vw, 5.75rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  brand-statement:
    fontFamily: "Lexend, Arial, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 3.75rem)"
    fontWeight: 300
    lineHeight: 1.15
  brand-statement-mobile:
    fontFamily: "Lexend, Arial, sans-serif"
    fontSize: "clamp(1.75rem, 7vw, 3rem)"
    fontWeight: 300
    lineHeight: 1.15
  auth-display-mobile:
    fontFamily: "Lexend, Arial, sans-serif"
    fontSize: "clamp(2.25rem, 12vw, 3.5rem)"
    fontWeight: 500
    lineHeight: 1.05
  brand-statement-landscape:
    fontFamily: "Lexend, Arial, sans-serif"
    fontSize: "clamp(1.25rem, 4vw, 2rem)"
    fontWeight: 300
    lineHeight: 1.15
  auth-display-landscape:
    fontFamily: "Lexend, Arial, sans-serif"
    fontSize: "clamp(2rem, 7vw, 3rem)"
    fontWeight: 500
    lineHeight: 1.05
  body:
    fontFamily: "Quicksand, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.65
  label:
    fontFamily: "Quicksand, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.45
rounded:
  xs: "0.375rem"
  sm: "0.625rem"
  md: "1rem"
  lg: "1.5rem"
  pill: "999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "2.5rem"
  3xl: "3rem"
  4xl: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.omnia-black}"
    textColor: "{colors.omnia-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.25rem"
    height: "3rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.omnia-black}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1rem"
    height: "3.25rem"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-inverse-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
---

# Design System: OMNIA Craft 2.0

## Overview

**Creative North Star: "Control sereno"**

OMNIA Craft conserva una identidad operativa, precisa y contenida. El fondo oscuro es la fuente visual de verdad; superficies blancas aparecen cuando una tarea necesita máxima concentración, como en autenticación. La marca se expresa mediante el logotipo, tipografía redondeada, grandes titulares y acentos OMNIA usados con intención.

**Características clave:** dark-first, jerarquía tipográfica amplia, controles accesibles, profundidad moderada y separación visual clara entre el contexto interno morado y el contexto cliente azul.

## Colors

La base casi negra y blanca cálida mantiene la interfaz sobria; morado y azul orientan contexto, amarillo marca foco y carmesí comunica error.

- **Morado OMNIA:** identidad primaria, caret y contexto interno.
- **Azul OMNIA:** contexto cliente y fondos atmosféricos secundarios.
- **Amarillo OMNIA:** foco perceptible y señal de estado; no es decoración general.
- **Carmesí OMNIA:** errores y acentos puntuales.
- **Neutros:** texto, fondos y divisores; las superficies claras conservan texto casi negro.

**The Context Color Rule.** Morado representa `/app`; azul representa `/portal`. El color orienta, pero nunca comunica autoridad por sí solo.

## Typography

**Display Font:** Lexend, con Arial y sans-serif como fallback.  
**Body Font:** Quicksand, con Arial y sans-serif como fallback.

Lexend aporta voz institucional a títulos, marca y encabezados. Quicksand mantiene formularios, navegación y texto operativo legibles y cercanos. Los títulos usan tracking negativo y peso regular o medio; etiquetas y acciones usan peso bold.

## Layout

Auth usa una composición de dos columnas: relato de marca oscuro a la izquierda y panel de tarea blanco a la derecha. El contenido del formulario se limita a `31rem`; a `56rem` pasa a una sola columna y el panel pierde radio y sombra. Bajo `30rem`, acciones y filas de etiquetas se apilan. En landscape de poca altura recupera dos columnas compactas para mantener el formulario dentro del viewport inicial.

Los shells comparten un contenedor máximo de `80rem`, header, contenido centrado y footer. El cuerpo usa padding fluido; a `46rem` el header se apila, la navegación puede desplazarse horizontalmente y los bloques de dos columnas pasan a una. Las áreas de lectura se limitan a aproximadamente `68ch`.

Las superficies CRM usan modo Operate: encabezados más compactos, tablas semánticas de ancho completo y formularios laterales. A `56rem` el detalle de dos columnas pasa a una; bajo `40rem`, acciones y filas de formulario se apilan. Filtros, pestañas y paginación conservan su estado en la URL.

## Elevation & Depth

La profundidad es contenida y funcional. El panel Auth usa una sombra oscura amplia para separarse del lienzo de marca; botones sólo elevan ligeramente en hover. Los shells prefieren gradientes radiales tenues, bordes translúcidos y capas tonales antes que tarjetas flotantes repetidas.

**The Restrained Depth Rule.** Las superficies permanecen planas salvo cuando la separación de tarea o un estado interactivo necesita profundidad.

## Shapes

Los controles usan esquinas suavemente redondeadas (`0.625rem`), paneles principales radios medianos (`1rem`) y navegación cápsula. Los bordes son finos y translúcidos; el radio acompaña la función y no convierte cada contenido en tarjeta.

## Components

### Buttons

- Primarios: fondo casi negro, texto blanco, ancho completo en formularios y altura mínima de `3rem`.
- Hover: desplazamiento vertical de `-2px` y sombra leve; disabled conserva contraste y cursor de espera.
- Acciones textuales: morado, subrayado visible y área táctil mínima de `2.75rem`.

### Inputs / Fields

- Label siempre visible; ayuda y error quedan junto al campo.
- Superficie blanca, borde fuerte y altura mínima de `3.25rem`.
- Foco sobre superficies claras con outline morado de contraste y halo amarillo companion; error con borde carmesí y fondo teñido.
- Contraseñas incluyen acción textual mostrar/ocultar sin bloquear pegado, autocompletado ni password managers.

### Cards / Containers

- El panel Auth es el contenedor elevado principal.
- Mensajes y estados completos usan fondos tintados suaves, radios medianos y padding de la escala.
- En shells, la división de contenido se resuelve con líneas y espacio antes que con tarjetas.

### Navigation

- Marca a la izquierda y acciones cápsula a la derecha.
- Hover/activo elevan contraste mediante una capa blanca translúcida.
- El cambio de contexto sólo aparece cuando la sesión realmente posee ambos memberships.
- Logout bloquea doble envío, anuncia progreso y conserva un error local recuperable.

### Data Tables & Status

- Tablas CRM planas, con divisores finos, numerales tabulares y scroll horizontal contenido en pantallas estrechas.
- Status usa chips compactos; color acompaña texto explícito y nunca es el único indicador.
- Paginación y filtros tienen targets mínimos de `2.75rem`, labels visibles y estados vacíos con una siguiente acción concreta.

### States

- Carga y restauración de sesión usan una superficie oscura centrada con pulso amarillo.
- Errores combinan texto, borde y superficie; nunca dependen sólo del color.
- Todos los estados de autenticación mantienen feedback próximo a la acción que lo produjo.
- La navegación SPA mueve foco al `h1` de la nueva ruta para anunciar el cambio de contexto.

## Do's and Don'ts

### Do:

- **Do** preservar logos, Lexend, Quicksand y la paleta OMNIA existente.
- **Do** mantener labels visibles, foco de alto contraste, navegación por teclado y áreas táctiles de al menos `2.75rem`.
- **Do** adaptar Auth y shells con los breakpoints incumbentes y respetar `prefers-reduced-motion`.
- **Do** tratar capabilities visibles como ayudas de UX; RLS y RPC siguen siendo la autoridad.

### Don't:

- **Don't** usar color, rutas visibles o metadata de usuario como prueba de autorización.
- **Don't** introducir tarjetas, sombras o gradientes sin una función clara.
- **Don't** impedir pegado, autocompletado o password managers en formularios de acceso.
- **Don't** anticipar Projects, dashboards, Realtime u otros dominios posteriores dentro de las superficies CRM de Phase 3.
