#!/bin/bash

wget https://github.com/FaintGhost/files/raw/main/Dockerfile
wget https://github.com/FaintGhost/files/raw/main/System.Net.Http.dll
wget https://github.com/FaintGhost/files/raw/main/Emby.Web.dll
wget https://raw.githubusercontent.com/FaintGhost/files/main/embypremiere.js
docker build -f Dockerfile -t ttdark/emby_crack:latest .
