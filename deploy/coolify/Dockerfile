# nginx with the site's rules built in (nginx.conf, beside this file). It is an image and not a
# mounted file so that a deployment needs nothing from the repository at run time.
FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
