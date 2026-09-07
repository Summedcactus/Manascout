# ManaScout

Static V1 of ManaScout, an independent Magic: The Gathering card discovery and printing explorer.

## GitHub Pages deployment

1. Upload the contents of this project to the root of the `Summedcactus/Manascout` repository.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`.
5. Save.
6. Set the custom domain to `manascout.co.uk`.

The included `CNAME` file already contains `manascout.co.uk`.

## Data

Card data, imagery and price fields are retrieved client-side from the Scryfall API. The application does not hardcode card prices or card facts.

## V1 scope

Search → card details → printing table → external marketplace search.

The future ManaScout recommendation layer should be added separately from factual source data.
