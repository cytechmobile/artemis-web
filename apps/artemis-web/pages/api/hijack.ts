import authorization from '../../middleware/authorization';
import nc from 'next-connect';
import {
  NextApiRequestExtended,
  NextApiResponseExtended,
} from '../../definitions';
import auth from '../../middleware/auth';

const handler = nc()
  .use(auth)
  .use(authorization(['admin']))
  .post(async (req: NextApiRequestExtended, res: NextApiResponseExtended) => {
    const host: string = process.env.DATABASE_HOST;
    const configHost: string = process.env.CONFIG_HOST;
    const port: number = parseInt(process.env.API_PORT, 10);
    let resp = null;

    switch (req.body.action) {
      case 'comment':
        resp = await fetch(`http://${host}:${port}/hijackComment`, {
          method: 'POST',
          body: JSON.stringify({
            key: req.body.key,
            comment: req.body.comment,
          }),
        });

        if (resp.status === 200) {
          res.status(200);
          res.json({ status: 'Comment updated.' });
        } else {
          res.status(500);
          res.json({ status: 'Error' });
        }

        break;
      case 'approve':
        resp = await fetch(`http://${configHost}:${port}/hijackLearnRule`, {
          method: 'POST',
          body: JSON.stringify({
            key: req.body.key,
            prefix: req.body.prefix,
            type: req.body.type_,
            hijack_as: req.body.hijack_as,
            action: req.body.action,
          }),
        });

        if (resp.status === 200) {
          res.status(200);
          res.json({ status: 'rule learned.' });
        } else {
          res.status(500);
          res.json({ status: 'Error' });
        }

        break;
      case 'show':
        resp = await fetch(`http://${configHost}:${port}/hijackLearnRule`, {
          method: 'POST',
          body: JSON.stringify({
            key: req.body.hijack_key,
            prefix: req.body.prefix,
            type: req.body.type_,
            hijack_as: req.body.hijack_as,
            action: req.body.action,
          }),
        });

        if (resp.status === 200) {
          res.status(200);
          res.json(await resp.json());
        } else {
          res.status(500);
          res.json({ status: 'Error' });
        }

        break;
      default:
        resp = await fetch(`http://${host}:${port}/hijackMultiAction`, {
          method: 'POST',
          body: JSON.stringify({
            keys: req.body.hijack_keys,
            action: req.body.action,
            state: req.body.state,
          }),
        });

        if (resp.status === 200) {
          res.status(200);
          res.json({ status: 'Action updated.' });
        } else {
          res.status(500);
          res.json({ status: 'Error' });
        }

        break;
    }
  });

export default handler;
