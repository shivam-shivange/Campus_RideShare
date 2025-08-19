export const validate =
  (schema) => (req, res, next) => {
    const src = ["GET", "DELETE"].includes(req.method) ? req.query : req.body;
    const { error, value } = schema.validate(src, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ message: "Validation error", details: error.details });
    if (["GET", "DELETE"].includes(req.method)) req.query = value;
    else req.body = value;
    next();
  };
