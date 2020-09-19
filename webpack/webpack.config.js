const path = require('path');

module.exports = {
    entry: {
        app: './index.js'
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve( __dirname, 'dist' )
    },
    node: {
        fs: 'empty'
    },
    devtool: 'source-map'
};