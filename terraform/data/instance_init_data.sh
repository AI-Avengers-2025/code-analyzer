#!/bin/bash

yum update -y
sudo yum install -y nodejs npm
npm install -g pm2

pm2 startup
pm2 save
