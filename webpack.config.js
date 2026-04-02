const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin')

module.exports = (env, argv) => {
  // Figma's plugin sandbox blocks eval(), so we can never use webpack's default
  // 'eval-source-map' devtool. Use inline-source-map in dev (slower but safe),
  // and no source map in production.
  const devtool = argv.mode === 'production' ? false : 'inline-source-map'

  return [
    // ── Plugin sandbox (Figma API access, no DOM) ──────────────────────────
    {
      entry: './src/plugin/main.ts',
      devtool,
      output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
      },
      resolve: {
        extensions: ['.ts', '.js'],
        alias: { shared: path.resolve(__dirname, 'shared') },
      },
      module: {
        rules: [
          {
            test: /\.ts$/,
            use: {
              loader: 'ts-loader',
              options: { configFile: 'tsconfig.plugin.json' },
            },
            exclude: /node_modules/,
          },
        ],
      },
    },

    // ── UI iframe (React, DOM, fetch access) ───────────────────────────────
    {
      entry: './src/ui/index.tsx',
      devtool,
      output: {
        filename: 'ui.js',
        path: path.resolve(__dirname, 'dist'),
      },
      resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        alias: { shared: path.resolve(__dirname, 'shared') },
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: {
              loader: 'ts-loader',
              options: { configFile: 'tsconfig.json' },
            },
            exclude: /node_modules/,
          },
          { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        ],
      },
      plugins: [
        new HtmlWebpackPlugin({
          template: './src/ui/ui.html',
          filename: 'ui.html',
          inject: 'body',
          scriptLoading: 'blocking',
        }),
        new HtmlInlineScriptPlugin(),
      ],
    },
  ]
}
