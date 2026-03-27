# Project Memory: Visant Exporter (by Visant Studios)

## Overview
This project is **Visant Exporter**—a React-based tool that generates high-resolution background and SVG export plugin code for Figma. It currently operates as a standalone web application built with Vite and Express, supporting Figma selection discovery.

## Current State
- **React App**: A modern interface for configuring an exporter plugin.
- **Generator Logic**: Produces `manifest.json`, `code.ts`, and `ui.html` content as strings.
- **Missing Link**: No direct way to run this *inside* Figma yet. The user has to copy/paste files manually.

## Goals
- [ ] Transition the React app to be the UI of the plugin (or provide a sub-project).
- [ ] Automated export/build of the generated plugin.
- [ ] Connect the local development server (Vite) to Figma for live preview.

## Checklist for Figma Plugin Support
- [x] Add `@figma/plugin-typings`.
- [x] Create `manifest.json` at the root (Fix: use `networkAccess` with `reasoning` field for localhost).
- [x] Implement `src/plugin/code.ts` for the Figma Sandbox side logic.
- [ ] Update `vite.config.ts` to (optionally) bundle into a single file or handle plugin environment.
