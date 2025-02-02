const express = require('express');
const mysql = require('mysql2');
const cors = require('cors'); // Opcional: si necesitas habilitar CORS

const app = express();
const port = 3000;

// Middleware
app.use(express.json()); // Para manejar peticiones JSON
//app.use(cors()); // Habilitar CORS si es necesario

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static('public'));

// Ruta para servir el index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Conexión a MySQL
const db = mysql.createConnection({
  host: 'mysql-infoTracker.alwaysdata.net',
  user: '378117',  // Tu usuario de MySQL
  password: 'ITS!2024@',  // Tu contraseña de MySQL
  database: 'infotracker_asthonia',  // Nombre de tu base de datos
});

db.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conexión exitosa a la base de datos MySQL');
});

// Rutas de ejemplo
app.get('/', (req, res) => {
  res.send('¡Servidor funcionando!');
});

// Crear un pedido
app.post('/mesas/:id/pedido', (req, res) => {
    const { id } = req.params;
    const { items } = req.body;

    // Verificar si ya existe un pedido abierto para la mesa
    db.execute('SELECT id FROM pedido WHERE mesa_id = ? AND estado = "abierto"', [id], (err, result) => {

      if (err) {
        return res.status(500).json({ error: 'Error al verificar el pedido existente', details: err });
      }
  
      let pedidoId;
      
      if (result.length > 0) {
        // Pedido abierto encontrado
        pedidoId = result[0].id;
        insertarDetallesPedido(pedidoId, items, res);
      } else {
        // Crear un nuevo pedido
        db.execute('INSERT INTO pedido (mesa_id, estado) VALUES (?, ?)', [id, 'abierto'], (err, result) => {
          if (err) {
            return res.status(500).json({ error: 'Error al crear el pedido', details: err });
          }
  
          pedidoId = result.insertId;
          insertarDetallesPedido(pedidoId, items, res);
        });
      }
    });
  });
  
  // Función para insertar los detalles del pedido
  function insertarDetallesPedido(pedidoId, items, res) {
    const queries = items.map(item => {
      return db.execute('INSERT INTO pedidoDetalle (pedido_id, nombre, categoria, precio, cantidad) VALUES (?, ?, ?, ?, 1)', [
        pedidoId, item.nombre, item.categoria, item.precio
      ]);
    });
  
    Promise.all(queries)
      .then(() => {
        res.status(201).json({ mensaje: 'Pedido actualizado con éxito', pedidoId });
      })
      .catch(err => {
        res.status(500).json({ error: 'Error al agregar detalles del pedido', details: err });
      });
  }
  

// Obtener el pedido
app.get('/mesas/:id/pedido', (req, res) => {
  const { id } = req.params;

  db.execute('SELECT * FROM pedido WHERE mesa_id = ? AND estado = ?', [id, 'abierto'], (err, pedido) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener el pedido', details: err });
    }

    if (pedido.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontró el pedido abierto para esta mesa' });
    }

    db.execute('SELECT * FROM pedidoDetalle WHERE pedido_id = ?', [pedido[0].id], (err, detalles) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener los detalles del pedido', details: err });
      }

      res.json({ pedido: pedido[0], detalles });
    });
  });
});

// Cerrar el pedido
app.put('/mesas/:id/cerrar', (req, res) => {
  const { id } = req.params;

  db.execute('SELECT id FROM pedido WHERE mesa_id = ? AND estado = ?', [id, 'abierto'], (err, pedido) => {
    if (err) {
      return res.status(500).json({ error: 'Error al buscar el pedido', details: err });
    }

    if (pedido.length === 0) {
      return res.status(404).json({ mensaje: 'No hay un pedido abierto para esta mesa' });
    }

    const pedidoId = pedido[0].id;

    db.execute('SELECT precio, cantidad FROM pedidoDetalle WHERE pedido_id = ?', [pedidoId], (err, detalles) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener los detalles del pedido', details: err });
      }

      const total = detalles.reduce((acc, detalle) => acc + (detalle.precio * detalle.cantidad), 0);

      db.execute('UPDATE pedido SET estado = ?, total = ? WHERE id = ?', ['cerrado', total, pedidoId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Error al cerrar el pedido', details: err });
        }

        res.json({ mensaje: 'Pedido cerrado', total });
      });
    });
  });
});

// Obtener todas las mesas
app.get('/mesas', (req, res) => {
    const query = `
      SELECT 
        mesas.id AS mesa_id, mesas.nombre AS mesa_nombre,
        pedido.id AS pedido_id, pedido.estado,
        pedidoDetalle.nombre, pedidoDetalle.categoria, pedidoDetalle.precio, pedidoDetalle.cantidad
      FROM mesas
      LEFT JOIN pedido ON mesas.id = pedido.mesa_id AND pedido.estado = 'abierto'
      LEFT JOIN pedidoDetalle ON pedido.id = pedidoDetalle.pedido_id
    `;
  
    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener las mesas', details: err });
      }
  
      // Agrupar los resultados por mesa y pedido
      const mesas = [];
      const mesaMap = {};
  
      results.forEach(row => {
        if (!mesaMap[row.mesa_id]) {
          mesaMap[row.mesa_id] = {
            id: row.mesa_id,
            nombre: row.mesa_nombre,
            pedido: row.pedido_id ? { id: row.pedido_id, estado: row.estado, detalles: [], total: 0 } : null
          };
          mesas.push(mesaMap[row.mesa_id]);
        }
  
        // Agregar detalles del pedido si existen
        if (row.pedido_id) {
          const detalle = {
            nombre: row.nombre,
            categoria: row.categoria,
            precio: row.precio,
            cantidad: row.cantidad,
          };
  
          if (detalle.nombre) {
            mesaMap[row.mesa_id].pedido.detalles.push(detalle);
            mesaMap[row.mesa_id].pedido.total += (detalle.precio * detalle.cantidad);
          }
        }
      });
  
      res.json({ mesas });
    });
  });

  app.get('/pedidoscerrados', (req, res) => {
    const today = new Date().toISOString().split('T')[0]; // Obtiene la fecha de hoy en formato YYYY-MM-DD
    
    const query = `
      SELECT 
        mesas.id AS mesa_id, mesas.nombre AS mesa_nombre,
        pedido.id AS pedido_id, pedido.estado, pedido.fecha,
        pedidoDetalle.nombre, pedidoDetalle.categoria, pedidoDetalle.precio, pedidoDetalle.cantidad
      FROM mesas
      INNER JOIN pedido ON mesas.id = pedido.mesa_id AND pedido.estado = 'cerrado' 
        AND DATE(pedido.fecha) = ?  -- Filtra por la fecha de hoy
      INNER JOIN pedidoDetalle ON pedido.id = pedidoDetalle.pedido_id
    `;
    
    db.query(query, [today], (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener los pedidos cerrados', details: err });
      }
    
      // Agrupar los resultados por mesa y pedido
      const mesas = [];
      const mesaMap = {};
    
      results.forEach(row => {
        if (!mesaMap[row.mesa_id]) {
          mesaMap[row.mesa_id] = {
            id: row.mesa_id,
            nombre: row.mesa_nombre,
            pedido: row.pedido_id ? { id: row.pedido_id, estado: row.estado, fecha: row.fecha, detalles: [], total: 0 } : null
          };
          mesas.push(mesaMap[row.mesa_id]);
        }
    
        // Agregar detalles del pedido si existen
        if (row.pedido_id) {
          const detalle = {
            nombre: row.nombre,
            categoria: row.categoria,
            precio: row.precio,
            cantidad: row.cantidad,
          };
    
          if (detalle.nombre) {
            mesaMap[row.mesa_id].pedido.detalles.push(detalle);
            mesaMap[row.mesa_id].pedido.total += (detalle.precio * detalle.cantidad);
          }
        }
      });
    
      res.json({ mesas });
    });
  });
  
  
  app.delete('/pedidoDetalle/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM pedidoDetalle WHERE id = ?';
  
    db.execute(query, [id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar el detalle del pedido', details: err });
      }
  
      res.status(200).json({ mensaje: 'Detalle del pedido eliminado con éxito' });
    });
  });
  
  

  app.get('/pedidos/:mesaId', (req, res) => {
    const { mesaId } = req.params;
  
    // Consulta SQL para obtener los detalles del pedido abierto en la mesa
    const query = `
      SELECT p.id AS pedidoId, pd.categoria, pd.nombre, pd.precio
      FROM pedido p
      JOIN pedidoDetalle pd ON p.id = pd.pedido_id
      WHERE p.mesa_id = ?
      AND p.estado = 'abierto';
    `;
  
    db.execute(query, [mesaId], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener los detalles del pedido', details: err });
      }
  
      res.json({ pedidos: result });
    });
  });
  
// Cerrar el pedido
app.post('/mesas/:id/cerrarPedido', (req, res) => {
    const { id } = req.params;
  
    // Paso 1: Verificar si ya existe un pedido abierto para la mesa
    db.execute('SELECT id FROM pedido WHERE mesa_id = ? AND estado = ?', [id, 'abierto'], (err, pedido) => {
      if (err) {
        return res.status(500).json({ error: 'Error al buscar el pedido', details: err });
      }
  
      // Si no se encuentra un pedido abierto
      if (pedido.length === 0) {
        return res.status(404).json({ mensaje: 'No hay un pedido abierto para esta mesa' });
      }
  
      const pedidoId = pedido[0].id;
  
      // Paso 2: Obtener los detalles del pedido y calcular el total
      db.execute('SELECT precio, cantidad FROM pedidoDetalle WHERE pedido_id = ?', [pedidoId], (err, detalles) => {
        if (err) {
          return res.status(500).json({ error: 'Error al obtener los detalles del pedido', details: err });
        }
  
        // Calcular el total del pedido
        const total = detalles.reduce((acc, detalle) => acc + (detalle.precio * detalle.cantidad), 0);
  
        // Paso 3: Actualizar el estado del pedido y almacenar el total
        db.execute('UPDATE pedido SET estado = ?, total = ? WHERE id = ?', ['cerrado', total, pedidoId], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Error al cerrar el pedido', details: err });
          }
  
          // Paso 4: Responder con el mensaje de éxito y el total del pedido
          res.json({ mensaje: 'Pedido cerrado correctamente', total });
        });
      });
    });
  });
  

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
