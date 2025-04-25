FROM nginx:stable-alpine

WORKDIR /usr/share/nginx/html

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY . /usr/share/nginx/html/

EXPOSE 80
