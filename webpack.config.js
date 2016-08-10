module.exports = {
  entry: './mod',
  output: {
    path: __dirname + '/out',
    filename: 'bundle.js',
  },
  devtool: 'source-map',
  module: {
    loaders: [
      {
        test: /\.mod$/,
        loader: 'base64'
      }
    ]
  }
}
