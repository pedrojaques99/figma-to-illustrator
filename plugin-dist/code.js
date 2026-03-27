(() => {
  // src/plugin/code.ts
  figma.showUI(`
  <script>
    window.location.href = "http://localhost:3000";
  <\/script>
`, { width: 320, height: 480, title: "Visant Exporter" });
  var selectionTimeout = null;
  figma.on("selectionchange", async () => {
    if (selectionTimeout) clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(async () => {
      const selection = figma.currentPage.selection;
      const firstFrame = selection.find((node) => node.type === "FRAME");
      if (firstFrame) {
        try {
          const thumbBytes = await firstFrame.exportAsync({
            format: "PNG",
            constraint: { type: "WIDTH", value: 200 }
          });
          figma.ui.postMessage({
            type: "selection-updated",
            hasFrame: true,
            name: firstFrame.name,
            thumbnail: thumbBytes,
            count: selection.filter((n) => n.type === "FRAME").length,
            width: firstFrame.width,
            height: firstFrame.height
          });
        } catch (err) {
          console.error("Thumb export error:", err);
        }
      } else {
        figma.ui.postMessage({
          type: "selection-updated",
          hasFrame: false
        });
      }
    }, 100);
  });
  figma.ui.onmessage = async (msg) => {
    if (msg.type === "request-initial-selection") {
      const selection = figma.currentPage.selection;
      const firstFrame = selection.find((node) => node.type === "FRAME");
      if (firstFrame) {
        const thumbBytes = await firstFrame.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: 200 } });
        figma.ui.postMessage({ type: "selection-updated", hasFrame: true, name: firstFrame.name, thumbnail: thumbBytes, count: selection.filter((n) => n.type === "FRAME").length, width: firstFrame.width, height: firstFrame.height });
      } else {
        figma.ui.postMessage({ type: "selection-updated", hasFrame: false });
      }
    }
    if (msg.type === "resize") {
      figma.ui.resize(msg.width || 320, msg.height);
    }
    if (msg.type === "run-export") {
      const { config } = msg;
      const selection = figma.currentPage.selection;
      const frameSelection = selection.filter((n) => n.type === "FRAME");
      console.info(`[Architect] Export process started for ${frameSelection.length} frames.`);
      if (frameSelection.length === 0) {
        figma.notify("Selecione pelo menos um frame.");
        return;
      }
      let exportedCount = 0;
      const nameHistory = {};
      for (const node of frameSelection) {
        let bgClone = null;
        let uniqueName = node.name;
        try {
          const frameIndex = frameSelection.indexOf(node) + 1;
          const totalFrames = frameSelection.length;
          if (nameHistory[uniqueName] !== void 0) {
            nameHistory[uniqueName]++;
            uniqueName = `${node.name} (${nameHistory[uniqueName]})`;
          } else {
            nameHistory[uniqueName] = 0;
          }
          figma.ui.postMessage({
            type: "export-log",
            message: `[${frameIndex}/${totalFrames}] Iniciando "${uniqueName}"...`,
            logType: "info"
          });
          console.info(`[Architect] Processing "${uniqueName}" (${frameIndex}/${totalFrames})`);
          figma.ui.postMessage({ type: "export-log", message: `> Clonando frame...`, logType: "info" });
          bgClone = node.clone();
          bgClone.name = `${config.renamePrefix} ${node.name}`;
          if (node.parent) {
            node.parent.appendChild(bgClone);
          }
          figma.ui.postMessage({ type: "export-log", message: `> Ocultando vetores e textos...`, logType: "info" });
          const processNode = (n) => {
            const isVectorOrText = n.type === "TEXT" || n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION" || n.type === "STAR" || n.type === "LINE" || n.type === "ELLIPSE" || n.type === "POLYGON" || n.type === "RECTANGLE";
            if (isVectorOrText) {
              const hasImageFill = "fills" in n && Array.isArray(n.fills) && n.fills.some((f) => f.type === "IMAGE");
              if (!hasImageFill) {
                n.opacity = 0;
              }
            }
            if ("children" in n) {
              for (const child of n.children) {
                processNode(child);
              }
            }
          };
          processNode(bgClone);
          const scale = Number(config.pngScale) || 5;
          figma.ui.postMessage({ type: "export-log", message: `> Exportando PNG Background (${scale}x)...`, logType: "info" });
          const pngBytes = await bgClone.exportAsync({
            format: "PNG",
            constraint: { type: "SCALE", value: scale }
          });
          let svgBytes = null;
          if (config.includeSvg) {
            figma.ui.postMessage({ type: "export-log", message: `> Exportando SVG Original...`, logType: "info" });
            svgBytes = await node.exportAsync({ format: "SVG" });
          }
          figma.ui.postMessage({
            type: "export-result",
            png: pngBytes,
            svg: svgBytes,
            name: uniqueName,
            folder: uniqueName,
            pngFilename: `${config.renamePrefix} ${uniqueName}.png`,
            svgFilename: `${uniqueName}.svg`
          });
          if (config.separateImages) {
            figma.ui.postMessage({ type: "export-log", message: `> Extraindo imagens individuais...`, logType: "info" });
            let imageCount = 0;
            const exportSeparateImages = async (n) => {
              const hasImageFill = "fills" in n && Array.isArray(n.fills) && n.fills.some((f) => f.type === "IMAGE");
              if (hasImageFill) {
                const imageBytes = await n.exportAsync({
                  format: "PNG",
                  constraint: { type: "SCALE", value: scale }
                });
                imageCount++;
                figma.ui.postMessage({
                  type: "export-result",
                  png: imageBytes,
                  name: `image-${imageCount}`,
                  folder: uniqueName,
                  pngFilename: `image-${imageCount}.png`
                });
              }
              if ("children" in n) {
                for (const child of n.children) {
                  await exportSeparateImages(child);
                }
              }
            };
            await exportSeparateImages(node);
            figma.ui.postMessage({ type: "export-log", message: `\u2713 ${imageCount} imagens separadas capturadas.`, logType: "success" });
          }
          exportedCount++;
          figma.ui.postMessage({ type: "export-log", message: `\u2713 "${uniqueName}" pronto.`, logType: "success" });
          console.info(`[Architect] "${uniqueName}" exported successfully.`);
        } catch (err) {
          console.error(`[Architect] Export error for "${uniqueName}":`, err);
          figma.ui.postMessage({
            type: "export-log",
            message: `\u2717 Erro em "${uniqueName}": ${err.message || "Erro desconhecido"}`,
            logType: "error"
          });
          figma.notify(`Erro ao exportar "${uniqueName}"`);
        } finally {
          if (bgClone) {
            try {
              bgClone.remove();
            } catch (e) {
              console.warn("Failed to remove clone:", e);
            }
          }
        }
      }
      figma.ui.postMessage({ type: "export-finished", count: exportedCount });
      if (exportedCount > 0) {
        figma.notify(`Sucesso: ${exportedCount} items exportados.`);
        console.info(`[Architect] Export finished. Total items: ${exportedCount}.`);
      } else {
        figma.ui.postMessage({ type: "export-log", message: "Nenhum frame foi exportado.", logType: "error" });
      }
    }
  };
})();
