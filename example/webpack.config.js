const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const path = require("path");

// Path to local react-monaco-editor source
const MonacoEditorSrc = path.join(__dirname, "..", "src");

module.exports = {
  entry: "./index.js",
  mode: "development",
  devtool: "source-map",
  output: {
    path: path.join(__dirname, "./lib/t"),
    filename: "index.js",
  },
  module: {
    rules: [
      {
        test: /\.html$/,
        use: ["file?name=[name].[ext]"],
      },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-env", "@babel/preset-react"],
              plugins: ["@babel/plugin-proposal-class-properties"],
            },
          },
        ],
      },
      {
        // Handle TypeScript files from local source
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: [
                "@babel/preset-env",
                "@babel/preset-react",
                "@babel/preset-typescript"
              ],
              plugins: ["@babel/plugin-proposal-class-properties"],
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.ttf$/,
        type: 'asset/resource'
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
    // Use local source for react-monaco-editor to test DB2 SQL support
    alias: {
      "react-monaco-editor": MonacoEditorSrc,
      // Ensure single React instance to avoid hooks error
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom")
    }
  },
  plugins: [
    new MonacoWebpackPlugin(),
  ],
  devServer: { contentBase: "./" },
};
