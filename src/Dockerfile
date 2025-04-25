# Use an official lightweight nginx image as the base
FROM nginx:stable-alpine

# Set the working directory inside the container
WORKDIR /usr/share/nginx/html

# Remove default nginx welcome page & default config to ensure ours is used
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*

# Copy your custom nginx configuration file
# Make sure 'nginx.conf' is the actual name of your config file in the project folder
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy all application files from your project folder
# This should run AFTER copying the nginx config
COPY . /usr/share/nginx/html/

# Tell Docker that the container listens on port 80
EXPOSE 80

# CMD ["nginx", "-g", "daemon off;"] # Use default CMD from base image