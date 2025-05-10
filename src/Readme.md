# Running our Website

In order to run our website, you can either *pull* from our Docker container, or download the repo for offline use. 
```
docker pull wgxm/capstone-app
```

From there, you can run the image like normal without any issues.


IF you are downloading for offline use and have the repo cloned:

**1.** Navigate to the src folder in the terminal:

> .\CS-25-304-SON-Researchers\src\

**2.** Run the following commands:

For Python 3:
```
py -m pip install http.server
py -m pip install csv_reader
```

**3.** Run the .tar file:
```
docker load -i capstone-app.tar
```

Run the .html files from local filesystem, and you're done!

If you wish to load the container up and run it, you can do so by building a container and then running everything inside of it. Name1 can be anything you want, same with name2.
Make sure you are in the right directory! Create and run the container within the src folder.
```
docker build -t [name1]
```

Then:
```
docker run -d -p 8080:80 --name [name2] [name1]
```
Go to http://localhost:8080, and you're done!
