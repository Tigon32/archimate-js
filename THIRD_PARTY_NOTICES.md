# Third-party notices

The application source and project-authored files are licensed under the MIT License in [`LICENSE`](LICENSE), subject to the separate notices below. Dependency packages are declared in [`package.json`](package.json); their upstream license files remain with the separately installed packages.

## Upstream source

This repository is a public fork of [`archimodel/archimate-js`](https://github.com/archimodel/archimate-js), licensed under MIT. See [`UPSTREAM.md`](UPSTREAM.md) for the baseline and source policy. The project uses `diagram-js`, `moddle`, and `moddle-xml` from bpmn.io under MIT; their notices are distributed with the separately installed packages.

Direct npm dependencies are declared in [`package.json`](package.json) and installed as separate packages, not copied into this repository. Their declared licenses are: MIT (`css.escape`, `diagram-js`, `diagram-js-direct-editing`, `eslint-plugin-bpmn-io`, `eslint-plugin-import`, `hex-and-rgba`, `ids`, `min-dash`, `min-dom`, `moddle`, `moddle-xml`, `tiny-svg`, and the listed development tools); ISC (`inherits`, `inherits-browser`, `saxes`); Apache-2.0 (`mathjs`, `typescript`); and OFL-1.1 (`archimate-font`). Each installed package carries its own license file. This is a direct-dependency inventory; CI `npm audit` covers the resolved dependency tree.

## Bundled fonts and icon assets

| Asset | Notice and license | Provenance |
| --- | --- | --- |
| `assets/ibm-plex-font/` | Copyright © 2017 IBM Corp.; SIL Open Font License 1.1. The full license is [`assets/ibm-plex-font/OFL.txt`](assets/ibm-plex-font/OFL.txt). | IBM Plex Sans font family. Reserved Font Name: Plex. |
| `assets/font-awesome-5/` | Font Awesome webfont files are licensed under SIL Open Font License 1.1; see [`assets/font-awesome-5/OFL.txt`](assets/font-awesome-5/OFL.txt). | Font Awesome 5 Free Solid webfont, identified by the included font metadata. Dave Gandy. The repository does not identify the exact upstream patch version. |
| `archimate-font/lib/` | The font package is licensed under SIL Open Font License 1.1; a copy is included at [`assets/archimate-font/OFL.txt`](assets/archimate-font/OFL.txt). Bundled Font Awesome glyphs use the OFL terms in [`assets/font-awesome-5/OFL.txt`](assets/font-awesome-5/OFL.txt). | Public package source: [`archimodel/archimate-font`](https://github.com/archimodel/archimate-font); its package metadata identifies Vincent Boulet as author. |
| `assets/icons/` | MIT license in this repository, inherited from the upstream project. | These SVGs are present in the public [`archimodel/archimate-js`](https://github.com/archimodel/archimate-js/tree/main/assets/icons) source and are covered by its repository license. |
| `archimate-font/src/` | ArchiMate font source and generated font are licensed under OFL 1.1; a copy is included at [`assets/archimate-font/OFL.txt`](assets/archimate-font/OFL.txt). | Public [`archimodel/archimate-font`](https://github.com/archimodel/archimate-font) package. Its README identifies Fontello as the font generation tool and SVG Path Editor as the drawing tool. |

Font Awesome distinguishes web and desktop font files (OFL 1.1) from SVG/JavaScript icon artwork (CC BY 4.0) and toolkit code (MIT). This repository bundles its webfont files, not the Font Awesome SVG/JavaScript icon pack. See the [official license](https://fontawesome.com/license/free) for the complete terms and version-specific details. The historical `archimate-font/lib/LICENSE.txt` contains an incomplete `SIL ()` placeholder; the full OFL text and attribution for the bundled font are now in [`assets/font-awesome-5/OFL.txt`](assets/font-awesome-5/OFL.txt).

No GPL-licensed dependency or asset is intentionally included in the project. This notice records repository-level provenance and bundled-font terms; it does not replace review of licenses for dependencies added in the future.

## Trademark and standards

ArchiMate® is a registered trademark of The Open Group. This project is not affiliated with, endorsed by, or certified by The Open Group, Archi, or bpmn.io. No ArchiMate specification text or protected standards artwork is redistributed by this project.
