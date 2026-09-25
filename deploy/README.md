# Static deployment preparation

`deploy/nginx/dailyinfo.conf.example` serves the Astro `dist/` output from
`/var/www/dailyinfo/current` without an application server.

## Shared password

Install the operating system's `htpasswd` utility, then create the password
file on the server. Choose the username interactively; never commit the file
or password to this repository.

```sh
sudo htpasswd -c /etc/nginx/.htpasswd-dailyinfo <username>
```

To add another user later, omit `-c`. The Nginx template uses Basic Auth only;
there is no login page, JWT, session, or user database.

## TLS prerequisites

The HTTPS block contains the future Let's Encrypt paths:

```text
/etc/letsencrypt/live/daily.iheadwater.org/fullchain.pem
/etc/letsencrypt/live/daily.iheadwater.org/privkey.pem
```

Do not enable or test that block until the domain resolves to the server and a
real certificate has been issued and verified. Port 80 keeps the ACME
challenge path available and redirects all other requests to HTTPS.

## Install and verify Nginx configuration

After DNS, certificate, password file, and release directory exist:

```sh
sudo cp deploy/nginx/dailyinfo.conf.example /etc/nginx/conf.d/dailyinfo.conf
sudo nginx -t
sudo systemctl reload nginx
```

The exact Nginx include directory may differ by Linux distribution.
