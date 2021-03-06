import resolveModule from './modules';

const SPECIAL_TYPES = ['isMemberExpression', 'isProperty'];

function isSpecialTypes(t, node) {
    return SPECIAL_TYPES.filter(type => t[type](node)).length > 0;
}

export default function({ types: t }) {
  // Tracking variables build during the AST pass. We instantiate
  // these in the `Program` visitor in order to support running the
  // plugin in watch mode or on multiple files.
  let ramdas,
      specified,
      selectedMethods;

  // Import a ramda method and return the computed import identifier
  function importMethod(methodName, file) {
    if (!selectedMethods[methodName]) {
      let path = resolveModule(methodName);
      selectedMethods[methodName] = file.addImport(path, 'default');
    }
    return t.clone(selectedMethods[methodName]);
  }

  return {
    visitor: {
      Program: {
        enter() {
          // Track the variables used to import ramda
          ramdas = Object.create(null);
          specified = Object.create(null);
          // Track the methods that have already been used to prevent dupe imports
          selectedMethods = Object.create(null);
        }
      },
      ImportDeclaration(path) {
        let { node } = path;
        if (node.source.value === 'ramda') {
          node.specifiers.forEach(spec => {
            if (t.isImportSpecifier(spec)) {
              specified[spec.local.name] = spec.imported.name;
            } else {
              ramdas[spec.local.name] = true;
            }
          });
          path.remove();
        }
      },
      CallExpression(path) {
        let { node, hub } = path;
        let { name } = node.callee;
        let { file } = hub;
        if (!t.isIdentifier(node.callee)) return;
        if (specified[name]) node.callee = importMethod(specified[name], file);
        if (node.arguments) {
          node.arguments = node.arguments.map(arg => {
            let { name } = arg;
            return specified[name]
              ? importMethod(specified[name], file)
              : arg;
          });
        }
      },
      MemberExpression(path) {
        let { node } = path;
        let { file } = path.hub;
        if (!ramdas[node.object.name]) return;
        // R.foo() -> foo()
        let newNode = importMethod(node.property.name, file);
        path.replaceWith({ type: newNode.type, name: newNode.name });
      },
      Property(path) {
        let { node, hub: { file } } = path;
        if (t.isIdentifier(node.key) && node.computed && specified[node.key.name]) {
          node.key = importMethod(specified[node.key.name], file);
        }
        if (t.isIdentifier(node.value) && specified[node.value.name]) {
          node.value = importMethod(specified[node.value.name], file);
        }
      },
      Identifier(path) {
        let { node, hub, parent } = path;
        let { name } = node;
        let { file } = hub;
        if (specified[name] && !isSpecialTypes(t, parent)) {
          let newNode = importMethod(specified[name], file);
          path.replaceWith({ type: newNode.type, name: newNode.name });
        }
      }
    }
  };
}
