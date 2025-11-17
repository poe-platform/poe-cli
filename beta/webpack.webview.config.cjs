const path = require("node:path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const isProduction = process.env.NODE_ENV === "production";

/** @type {import('webpack').Configuration} */
const previewConfig = {
  name: "preview",
  mode: isProduction ? "production" : "development",
  target: ["web", "es2020"],
  entry: {
    preview: path.resolve(__dirname, "vscode-extension/src/webview/preview/entry.ts"),
  },
  output: {
    path: path.resolve(__dirname, "vscode-extension/preview/public"),
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              configFile: path.resolve(__dirname, "vscode-extension/tsconfig.json"),
              transpileOnly: true,
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
            },
          },
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                config: path.resolve(__dirname, "postcss.config.cjs"),
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].css",
    }),
  ],
  devtool: isProduction ? false : "source-map",
  stats: "minimal",
};

module.exports = [previewConfig];
