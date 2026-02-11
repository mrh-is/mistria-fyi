export default {
  "*.{js,ts,svelte}": (files) => {
    const eslintFiles = files.filter((f) => !f.includes("service-worker"));
    return [
      `prettier --write ${files.join(" ")}`,
      ...(eslintFiles.length > 0 ? [`eslint --fix ${eslintFiles.join(" ")}`] : []),
    ];
  },
  "*.{json,md,css,html,yaml}": "prettier --write",
};
