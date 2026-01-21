const path = require('path');

module.exports = {
    entry: "./src/app.js",
    output: {
        path: path.resolve(__dirname, "build"),
        filename: "gamebuild.js",
        publicPath: '/build/'
    },
    externals: {
        "PIXI": "PIXI",
        "Stats": "Stats",
        "Howl": "Howl"
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"]
                    }
                }
            }
        ]
    },
    devServer: {
        static: {
            directory: path.join(__dirname, '/'),
        },
        port: 8080,
        open: true,
        hot: true
    }
};
