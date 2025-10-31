const path = require("node:path");

module.exports = {
  plugins: [
    require("@tailwindcss/postcss")({
      config: path.resolve(__dirname, "tailwind.config.cjs"),
    }),
    require("autoprefixer")(),
  ],
};
